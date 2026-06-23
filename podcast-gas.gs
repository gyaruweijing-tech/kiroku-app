/**
 * 俺専用ポッドキャスト自動生成システム（GAS版・改善版）
 * 最終更新: 2026-06-23
 *
 * 【前提セットアップ】APIキーはコードに書かない。
 *   Apps Scriptエディタ → ⚙️ プロジェクトの設定 → スクリプト プロパティ で
 *   以下2つを登録すること：
 *     GEMINI_API_KEY = Geminiのキー
 *     OPENAI_API_KEY = OpenAIのキー
 *
 * 【シート構成】A列=疑問 / B列=ステータス / C列=台本 / D列=企画メモ
 *   B列に「未処理」と入れた行が処理対象。
 *
 * 【処理の流れ】
 *   話題をとる(B列「未処理」) → ①企画を考える(検索なし)
 *   → ②調べて台本を書く(検索あり) → 音声化(TTS) → Drive保存
 *   ※Gemini 2回 + OpenAI 1回 のAPIを叩く。
 */

// ===== 設定（秘密情報はここに書かない！スクリプトプロパティから読む）=====
const CONFIG = {
  GEMINI_MODEL: 'gemini-2.5-flash',     // 安く済ますなら 'gemini-2.5-flash-lite'
  TTS_MODEL: 'tts-1',
  TTS_VOICE: 'nova',
  MAX_RETRIES: 3,
  TIME_BUDGET_MS: 5 * 60 * 1000,        // 6分制限の手前で打ち切り
  MAX_TTS_CHARS: 4000,                  // tts-1の上限(約4096)対策
  DRIVE_FOLDER_NAME: 'Podcast_出力'      // 出力をまとめるフォルダ
};

// ============================================================
//  UI層（移植時に捨てる部分）
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎙️ ポッドキャスト')
    .addItem('▶️ 未処理のお題を音声化する', 'generatePodcast')
    .addToUi();
}

function generatePodcast() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const startTime = Date.now();

  const keys = getApiKeys_();                          // キーは最初に1回取得
  const folder = getOutputFolder_(CONFIG.DRIVE_FOLDER_NAME);

  for (let i = 1; i < data.length; i++) {
    const topic = data[i][0];
    const status = String(data[i][1]).trim();          // 全角スペース等を吸収

    if (status !== '未処理') continue;
    if (!topic) continue;

    if (Date.now() - startTime > CONFIG.TIME_BUDGET_MS) {
      sheet.getRange(i + 1, 2).setValue('⏸️ 時間切れ（次回再実行してね）');
      break;
    }

    try {
      sheet.getRange(i + 1, 2).setValue('⏳ 生成中...');

      // ---- 核ロジック：企画→執筆 の2段思考 ----
      const result = generateScript(topic, keys.gemini);   // {plan, script}

      // C列=台本、D列=企画メモ を保存（改善の比較材料）
      sheet.getRange(i + 1, 3).setValue(result.script);
      sheet.getRange(i + 1, 4).setValue(result.plan);

      // TTS用に長さガード
      let speakText = result.script;
      if (speakText.length > CONFIG.MAX_TTS_CHARS) {
        speakText = speakText.slice(0, CONFIG.MAX_TTS_CHARS);
        Logger.log('⚠️ 台本が長すぎたので切り詰めました: ' + topic);
      }

      const audioBlob = synthesizeSpeech(speakText, keys.openai);

      // ファイル名サニタイズ＋日時で重複回避、専用フォルダへ
      const fileName = sanitizeFileName_(topic) + '_' +
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + '.mp3';
      const file = folder.createFile(audioBlob).setName(fileName);

      sheet.getRange(i + 1, 2).setValue('✅ 完了: ' + file.getUrl());

    } catch (error) {
      sheet.getRange(i + 1, 2).setValue('❌ エラー: ' + error.message);
    }
  }
}

// ---- UI補助 ----
function getApiKeys_() {
  const props = PropertiesService.getScriptProperties();
  const gemini = props.getProperty('GEMINI_API_KEY');
  const openai = props.getProperty('OPENAI_API_KEY');
  if (!gemini || !openai) {
    throw new Error('APIキー未設定。プロジェクト設定→スクリプトプロパティに GEMINI_API_KEY と OPENAI_API_KEY を登録してね。');
  }
  return { gemini: gemini, openai: openai };
}

function getOutputFolder_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function sanitizeFileName_(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'untitled';
}

// ============================================================
//  核ロジック層（キーは引数で受け取る純粋な形 → /api/generate へ移植しやすい）
// ============================================================

/** お題 → {plan(企画メモ), script(台本)} */
function generateScript(topic, apiKey) {
  // ① 企画フェーズ：検索なしで「どう面白くするか/何を調べるか」を先に思考
  const plan = callGemini(buildPlanPrompt(topic), false, apiKey);

  // ② 執筆フェーズ：企画に沿って検索で裏取りしながら執筆
  const script = callGemini(buildWritePrompt(topic, plan), true, apiKey);

  return { plan: plan, script: script };
}

function callGemini(prompt, useGrounding, apiKey) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    CONFIG.GEMINI_MODEL + ':generateContent?key=' + apiKey;

  const payload = {
    "contents": [{ "parts": [{ "text": prompt }] }],
    "generationConfig": { "temperature": 0.8 }
  };
  if (useGrounding) payload.tools = [{ "google_search": {} }];

  const options = {
    "method": "post", "contentType": "application/json",
    "payload": JSON.stringify(payload), "muteHttpExceptions": true
  };

  const response = fetchWithRetry(url, options);
  const json = JSON.parse(response.getContentText());

  if (json.error) throw new Error('Gemini APIが怒っています: ' + json.error.message);
  if (!json.candidates || json.candidates.length === 0) {
    throw new Error('Geminiの返答が空です。詳細: ' + response.getContentText());
  }

  // グラウンディングが本当に効いたかログで確認
  if (useGrounding) {
    const gm = json.candidates[0].groundingMetadata;
    if (gm) {
      Logger.log('✅ Web検索 実施。クエリ: ' + ((gm.webSearchQueries || []).join(' / ') || '(記録なし)'));
    } else {
      Logger.log('⚠️ groundingMetadata 無し＝Web検索されてない可能性大');
    }
  }

  const parts = json.candidates[0].content.parts || [];
  const text = parts.map(function (p) { return p.text || ''; }).join('').trim();
  if (!text) throw new Error('テキストが取れませんでした。詳細: ' + response.getContentText());
  return text;
}

function synthesizeSpeech(text, apiKey) {
  const url = 'https://api.openai.com/v1/audio/speech';
  const payload = { "model": CONFIG.TTS_MODEL, "input": text, "voice": CONFIG.TTS_VOICE };
  const options = {
    "method": "post", "headers": { "Authorization": "Bearer " + apiKey },
    "contentType": "application/json", "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    throw new Error('OpenAI TTSが怒っています: ' + response.getContentText());
  }
  return response.getBlob();
}

// ---- プロンプト ----
function buildPlanPrompt(topic) {
  return [
    'あなたは人気ポッドキャストの放送作家です。',
    '次の疑問を「思わず聞き入る回」にするための企画メモを作ってください。',
    '疑問：「' + topic + '」',
    '',
    '# 考えること（箇条書きで簡潔に）',
    '1. リスナーが本当に知りたい“核”は何か（表面の質問の奥にある本音）',
    '2. ありきたりな一般論を避けるための切り口・フックを1つ',
    '3. 答えを出すために具体的に何を調べるべきか：検索クエリを3〜5個。',
    '   「具体的な数字・固有名詞・実在の商品名・研究や統計」を狙うクエリにする。',
    '4. 番組の流れ（つかみ → 本題 → へぇポイント → 締め）',
    '',
    'これは次の執筆担当への指示書です。台本本文はまだ書かないこと。'
  ].join('\n');
}

function buildWritePrompt(topic, plan) {
  return [
    'あなたは聞き流し系ポッドキャストの単独ホストです。テーマは「' + topic + '」。',
    '以下の企画メモに沿って台本を書いてください。',
    '',
    '# 企画メモ',
    plan,
    '',
    '# 厳守ルール',
    '- 企画メモの検索クエリは必ずWeb検索して裏取りすること。記憶や推測で埋めない。',
    '- 一般論で終わらせない。具体的な数字・固有名詞・実在の商品名・研究/統計を最低2つ盛り込む。',
    '- 約1000文字、声に出して約3分。1人語りでテンポよく噛み砕いて。',
    '- マークダウン・見出し・役名・ト書きは書かず、読み上げるセリフ本文だけを出力する。'
  ].join('\n');
}

// ---- 503/429/一時障害向け 指数バックオフ（1s→2s→4s）----
function fetchWithRetry(url, options) {
  let lastResponse = null;
  for (let attempt = 0; attempt < CONFIG.MAX_RETRIES; attempt++) {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    if (code === 200) return response;
    if (code !== 503 && code !== 429 && code < 500) return response; // 無駄打ち回避
    lastResponse = response;
    if (attempt < CONFIG.MAX_RETRIES - 1) Utilities.sleep(Math.pow(2, attempt) * 1000);
  }
  return lastResponse;
}
