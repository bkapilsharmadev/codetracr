export interface EventConsumer {
  start(): Promise<void>;
}
