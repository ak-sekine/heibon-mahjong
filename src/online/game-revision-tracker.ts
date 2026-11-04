/** Tracks the newest accepted game view without mixing rooms or matches. */
export class GameRevisionTracker {
  private roomCode: string | null = null;
  private matchStartRevision = -1;
  private revision = -1;

  get latest(): number { return this.revision; }

  enterRoom(roomCode: string): void {
    if (roomCode === this.roomCode) return;
    this.roomCode = roomCode;
    this.matchStartRevision = -1;
    this.revision = -1;
  }

  startMatch(roomCode: string, revision: number): void {
    this.enterRoom(roomCode);
    if (!Number.isSafeInteger(revision) || revision < this.revision) return;
    this.matchStartRevision = revision;
    this.revision = revision;
  }

  observe(roomCode: string, revision: number): boolean {
    this.enterRoom(roomCode);
    if (!Number.isSafeInteger(revision) || revision < this.matchStartRevision || revision < this.revision) return false;
    this.revision = revision;
    return true;
  }

  clear(): void {
    this.roomCode = null;
    this.matchStartRevision = -1;
    this.revision = -1;
  }
}
