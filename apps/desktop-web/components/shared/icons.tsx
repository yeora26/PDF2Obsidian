import type { ReactNode, SVGProps } from 'react';

// 线性图标（24 网格，描边随 currentColor），避免引入图标库依赖
function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="1em"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
      width="1em"
      {...props}
    >
      {children}
    </svg>
  );
}

export function LogoIcon() {
  return (
    <Icon>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5" />
      <path d="m9 15 2.2-4 2.3 2.5L15 11" />
    </Icon>
  );
}

export function UploadIcon() {
  return (
    <Icon>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </Icon>
  );
}

export function SettingsIcon() {
  return (
    <Icon>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </Icon>
  );
}

export function WandIcon() {
  return (
    <Icon>
      <path d="m4 20 11-11" />
      <path d="m13 7 4 4" />
      <path d="M18 3v3M16.5 4.5h3M20 9v2M19 10h2M9 3v2M8 4h2" />
    </Icon>
  );
}

export function RefreshIcon() {
  return (
    <Icon>
      <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
      <path d="M20 20v-4h-4" />
    </Icon>
  );
}

export function FileTextIcon() {
  return (
    <Icon>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Icon>
  );
}

export function AlertIcon() {
  return (
    <Icon>
      <path d="M12 4 2.8 19a1 1 0 0 0 .9 1.5h16.6a1 1 0 0 0 .9-1.5Z" />
      <path d="M12 10v4M12 17.5v.01" />
    </Icon>
  );
}
