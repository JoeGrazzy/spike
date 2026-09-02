export {};

declare global {
  interface Fetcher {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  }

  interface Env {
    ASSETS: Fetcher;
  }

  interface Window {
    SPIKE_TELEMETRY_ENDPOINT?: string;
    SPIKETelemetry?: Readonly<{
      record: (type: string, payload: unknown) => void;
      flush: () => void;
    }>;
    SPIKEPremiumBack?: Readonly<{
      goBack: (button: HTMLButtonElement) => void;
    }>;
  }
}
