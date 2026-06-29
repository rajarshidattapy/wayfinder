export type Action = 'click' | 'type' | 'select' | 'scroll' | 'drag' | 'wait' | 'navigate';

export interface GuideRequest {
  goal: string;
  sessionId: string;
  completedSteps: string[];
  domSnapshot: string;
  screenshot: string;
  url: string;
}

export interface GuideResponse {
  selector: string;
  action: Action;
  value?: string;
  explanation: string;
  confidence: number;
  done: boolean;
  fallbackCoordinates?: { x: number; y: number };
  latencyMs?: number;
}

export interface ExtractedElement {
  tag: string;
  id?: string;
  text?: string;
  ariaLabel?: string;
  testId?: string;
  role?: string;
  href?: string;
  placeholder?: string;
  rect: { x: number; y: number; w: number; h: number };
  selector: string;
}

export interface DOMSnapshot {
  title: string;
  url: string;
  elements: ExtractedElement[];
}

// Chrome extension message types
export type ExtMessage =
  | { type: 'WF_START'; goal: string }
  | { type: 'WF_STOP' }
  | { type: 'WF_PING' }
  | { type: 'WF_NEXT_STEP'; payload: Omit<GuideRequest, 'screenshot'> }
  | { type: 'WF_SET_TOKEN'; token: string };
