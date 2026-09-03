export class LocalUtility {
  send(value: string): string {
    return value.trim();
  }

  subscribe(channel: string): boolean {
    return channel.trim().length > 0;
  }
}
