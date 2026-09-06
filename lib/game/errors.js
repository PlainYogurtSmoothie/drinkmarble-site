export class GameError extends Error {
  constructor(message, code = 'GAME_ERROR', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
