import type { PerformanceTier, RealtimeHealth, TabVisibility } from '../types.js';

export type TransportKind = 'websocket' | 'sse' | 'polling';

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'degraded';

export type PowerMode = 'normal' | 'battery' | 'thermal';

export interface TransportEndpoints {
  websocket?: string;
  sse?: string;
  polling?: string;
}

export interface ChartEngineConfig {
  renderer: 'svg' | 'canvas';
  animated: boolean;
  interpolation: boolean;
  gradientRichness: 'none' | 'subtle' | 'rich';
  maxPoints: number;
  redrawIntervalMs: number;
}

export interface ThemeTokens {
  glowIntensity: number;
  blurAllowed: boolean;
  backdropBlurPx: number;
  gradientAnimated: boolean;
  transparencyLevel: 'opaque' | 'balanced' | 'glass';
  accentAnimation: boolean;
  depthShadows: boolean;
}

export interface PlatformSnapshot<T> {
  metrics: T | null;
  cachedAt: number | null;
  isStale: boolean;
  connectionStatus: ConnectionStatus;
  activeTransport: TransportKind | null;
  effectiveTier: PerformanceTier;
  powerMode: PowerMode;
  visibility: TabVisibility;
  health: RealtimeHealth | null;
}

export interface RealtimeDashboardPlatformOptions<T> {
  endpoints: TransportEndpoints;
  storageKey?: string;
  cacheTtlMs?: number;
  devMode?: boolean;
  parseMessage?: (raw: string) => T | null;
  pollHeaders?: Record<string, string>;
}
