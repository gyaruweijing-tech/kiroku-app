// 自作の線画アイコン一式。絵文字をやめてここに統一する。
// 共通ルール：viewBox 24、線は currentColor（＝親の文字色を継ぐ）、
// 太さ 1.75・角丸（strokeLinecap/Join=round）。size で大きさだけ変える。
import { CSSProperties } from 'react';

type Props = {
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** 塗りつぶし版（星の「注力中」などで使う） */
  filled?: boolean;
};

function svg(size: number, className?: string, style?: CSSProperties) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style,
    'aria-hidden': true,
  };
}

export function IconStar({ size = 18, className, style, filled }: Props) {
  return (
    <svg {...svg(size, className, style)} fill={filled ? 'currentColor' : 'none'}>
      <polygon points="12 2.5 15 8.6 21.7 9.6 16.8 14.3 18 21 12 17.8 6 21 7.2 14.3 2.3 9.6 9 8.6 12 2.5" />
    </svg>
  );
}

export function IconTrash({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function IconCloud({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

export function IconTarget({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPlus({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// 「…」メニュー用の横三点
export function IconDots({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)} fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

export function IconChevronDown({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function IconArrowLeft({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

export function IconFile({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

// .mdで保存（書き出し）
export function IconDownload({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// .mdを開く（読み込み＝新ファイル追加）
export function IconFilePlus({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="12" x2="12" y2="18" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

export function IconEdit({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
    </svg>
  );
}

export function IconEye({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// 復元（ゴミ箱から戻す）
export function IconRestore({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

export function IconClose({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconFolder({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// 狙い＝目指す先（旗）
export function IconFlag({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

// 連続日数（炎）
export function IconFlame({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

// スタンプを押す（チェック）
export function IconCheck({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// 原点（芽・二葉）
export function IconSprout({ size = 18, className, style }: Props) {
  return (
    <svg {...svg(size, className, style)}>
      <path d="M12 20V11" />
      <path d="M7 20h10" />
      <path d="M12 11C12 8 9.5 6 6 6c0 3 2.5 5 6 5z" />
      <path d="M12 12.5c0-2.4 2-4.3 5-4.3 0 2.4-2 4.3-5 4.3z" />
    </svg>
  );
}

// 開発の軌跡（push・稲妻）
export function IconZap({ size = 18, className, style, filled }: Props) {
  return (
    <svg {...svg(size, className, style)} fill={filled ? 'currentColor' : 'none'}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
