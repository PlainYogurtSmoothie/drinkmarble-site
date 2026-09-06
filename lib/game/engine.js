import { EventEmitter } from './events.js';
import { defaultBoard, validateBoard, OWNABLE_TYPES } from './board.js';
import { defaultCards, validateCards } from './cards.js';
import { GameError } from './errors.js';
import { defaultSettings, mergeSettings, parseDiceSpec } from './settings.js';

export { GameError };

const COLORS = ['#ff5f5f', '#ffb347', '#ffe66d', '#7ae582', '#5fd3ff', '#7f7fff', '#e07fff', '#ff8fc8', '#c0ffee', '#ffa07a'];
const TEAM_COLORS = ['#ff5f5f', '#5fd3ff', '#7ae582', '#ffd166', '#e07fff', '#ffa07a'];
const MAX_HISTORY = 300;

/**
 * 주루마블 게임 엔진. 플랫폼/HTTP 를 모르고 순수 게임 규칙만 담당한다.
 *
 * 이벤트:
 *   'update'  (state)     상태 변경
 *   'roll'    (result)    주사위/룰렛 결과
 *   'penalty' (penalty)   벌칙 큐 항목 생성/완료
 *   'timeout' (player)    차례 방치 처리
 *   'joined' / 'left' (player) / 'reset' / 'settings' (settings)
 */
export class GameEngine extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.rng = opts.rng ?? Math.random;
    this.settings = mergeSettings(defaultSettings(), opts.settings ?? {});
    this.board = validateBoard(opts.board ?? defaultBoard());
    this.cards = validateCards(opts.cards ?? defaultCards());
    this.status = 'lobby'; // lobby | playing | paused | ended
    this.endedAt = null;
    this.endReason = null;
    this.players = [];
    this.teams = {}; // name -> { name, color }
    this.ownership = {}; // tileId -> playerId
    this.penalties = []; // 벌칙 큐
    this.penaltySeq = 0;
    this.undoStack = [];
    this.turnIndex = 0;
    this.direction = 1; // 1 정방향, -1 역방향
    this.round = 1;
    this.lastRoll = null;
    this.history = [];
    this.startedAt = Date.now();
    this.turnTimer = null;
    this.turnDeadline = null;
    this.timersEnabled = opts.timersEnabled !== false;
  }

  // ======================================================================
  // 조회
  // ======================================================================

  get mode() {
    return this.settings.turnMode;
  }

  get playerCount() {
    return this.players.length;
  }

  getPlayer(id) {
    return this.players.find((p) => p.id === id) ?? null;
  }

  findPlayerByName(name) {
    const n = String(name ?? '').trim().toLowerCase();
    return this.players.find((p) => p.name.toLowerCase() === n) ?? null;
  }

  currentPlayer() {
    if (this.players.length === 0) return null;
    return this.players[this.turnIndex % this.players.length] ?? null;
  }

  pendingPenalties(playerId) {
    return this.penalties.filter((p) => p.status === 'pending' && (!playerId || p.playerId === playerId));
  }

  teamSummary() {
    if (this.settings.teamMode !== 'on') return [];
    const map = new Map();
    for (const [name, t] of Object.entries(this.teams)) map.set(name, { ...t, players: [], drinks: 0, passes: 0 });
    for (const p of this.players) {
      if (!p.team) continue;
      if (!map.has(p.team)) map.set(p.team, { name: p.team, color: '#999', players: [], drinks: 0, passes: 0 });
      const t = map.get(p.team);
      t.players.push(p.id);
      t.drinks += p.drinks;
      t.passes += p.passes;
    }
    return [...map.values()];
  }

  toJSON() {
    return {
      settings: this.settings,
      mode: this.settings.turnMode,
      gameType: this.settings.gameType,
      round: this.round,
      turnIndex: this.turnIndex,
      direction: this.direction,
      currentPlayerId: this.currentPlayer()?.id ?? null,
      turnDeadline: this.turnDeadline,
      players: this.players.map((p) => ({ ...p })),
      teams: this.teamSummary(),
      board: this.board.map((t) => (this.ownership[t.id] ? { ...t, owner: this.ownership[t.id] } : t)),
      penalties: this.pendingPenalties(),
      lastRoll: this.lastRoll,
      history: this.history.slice(-30),
      canUndo: this.undoStack.length > 0,
      startedAt: this.startedAt,
      status: this.status,
      endedAt: this.endedAt,
      endReason: this.endReason,
      cards: this.cards,
      leaderboard: this.leaderboard(),
    };
  }

  // ======================================================================
  // 설정
  // ======================================================================

  applySettings(patch) {
    const next = mergeSettings(this.settings, patch);
    const prev = this.settings;
    this.settings = next;
    if (next.gameType === 'roulette') {
      // 룰렛은 위치 개념이 없다
      for (const p of this.players) p.position = 0;
      this.ownership = {};
    }
    if (next.propertyMode === 'off') this.ownership = {};
    if (next.teamMode === 'off') for (const p of this.players) p.team = null;
    if (next.penaltyMode === 'instant' && prev.penaltyMode === 'queue') {
      // 큐 → 즉시 전환: 대기 중 벌칙은 모두 집계 처리
      for (const pen of this.pendingPenalties()) this.completePenalty(pen.id, { silent: true });
    }
    this.log('settings', `설정 변경: ${Object.keys(patch ?? {}).join(', ')}`);
    this.emit('settings', this.settings);
    this.armTurnTimer();
    this.emitUpdate();
    return this.settings;
  }

  setBoard(tiles) {
    this.board = validateBoard(tiles);
    for (const p of this.players) p.position = Math.min(p.position, this.board.length - 1);
    this.ownership = {};
    this.log('board', `보드 변경 (${this.board.length}칸)`);
    this.emit('board', this.board);
    this.emitUpdate();
    return this.board;
  }

  setCards(cards) {
    this.cards = validateCards(cards);
    this.log('cards', `황금열쇠 변경 (${this.cards.length}장)`);
    this.emit('cards', this.cards);
    this.emitUpdate();
    return this.cards;
  }

  drawCard() {
    const weights = this.cards.map((c) => (c.weight === undefined ? 1 : Math.max(0, c.weight)));
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) return this.cards[Math.floor(this.rng() * this.cards.length)];
    let r = this.rng() * sum;
    for (let i = 0; i < this.cards.length; i += 1) {
      r -= weights[i];
      if (r < 0) return this.cards[i];
    }
    return this.cards[this.cards.length - 1];
  }

  /** "1d20" 같은 표기로 주사위 변경. 1개면 더블 규칙도 none 으로 */
  setDice(spec) {
    return this.applySettings(parseDiceSpec(spec, this.settings));
  }

  setMode(mode) {
    return this.applySettings({ turnMode: mode === 'free' ? 'free' : 'turn', ...(mode === 'free' ? { doubleRule: 'none', turnTimeoutAction: 'none' } : {}) });
  }

  // ======================================================================
  // 플레이어 / 팀
  // ======================================================================

  addPlayer({ id, name, platform = 'local', role = 'viewer', team = null }) {
    if (!id) throw new GameError('플레이어 id 가 필요합니다', 'INVALID_PLAYER');
    const existing = this.getPlayer(id);
    if (existing) {
      if (team && this.settings.teamMode === 'on') this.setTeam(id, team);
      return existing;
    }
    if (this.players.length >= this.settings.maxPlayers) {
      throw new GameError(`정원(${this.settings.maxPlayers}명)이 가득 찼습니다`, 'FULL');
    }
    const cleanName = String(name ?? id).trim().slice(0, 20) || id;
    const player = {
      id,
      name: cleanName,
      platform,
      role,
      team: null,
      color: COLORS[this.players.length % COLORS.length],
      position: 0,
      laps: 0,
      drinks: 0,
      passes: 0,
      skipTurns: 0,
      rolls: 0,
      doubleStreak: 0,
      lastRollAt: 0,
      joinedAt: Date.now(),
    };
    this.players.push(player);
    if (team && this.settings.teamMode === 'on') this.setTeam(id, team, { silent: true });
    this.log('join', `${player.name} 참가${player.team ? ` (${player.team}팀)` : ''}`, { playerId: id });
    this.emit('joined', player);
    if (this.players.length === 1) this.armTurnTimer();
    this.emitUpdate();
    return player;
  }

  removePlayer(id) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx < 0) throw new GameError('플레이어를 찾을 수 없습니다', 'NOT_FOUND', 404);
    const [player] = this.players.splice(idx, 1);
    if (idx < this.turnIndex) this.turnIndex -= 1;
    this.turnIndex = this.players.length ? ((this.turnIndex % this.players.length) + this.players.length) % this.players.length : 0;
    for (const [tile, owner] of Object.entries(this.ownership)) if (owner === id) delete this.ownership[tile];
    for (const pen of this.penalties) if (pen.playerId === id && pen.status === 'pending') pen.status = 'void';
    this.log('leave', `${player.name} 퇴장`, { playerId: id });
    this.emit('left', player);
    this.armTurnTimer();
    this.emitUpdate();
    return player;
  }

  updatePlayer(id, { name, color, team } = {}) {
    const p = this.getPlayer(id);
    if (!p) throw new GameError('플레이어를 찾을 수 없습니다', 'NOT_FOUND', 404);
    if (name !== undefined) {
      const n = String(name).trim().slice(0, 20);
      if (!n) throw new GameError('이름이 비어 있습니다', 'INVALID');
      p.name = n;
    }
    if (color !== undefined) {
      if (!/^#[0-9a-fA-F]{3,8}$/.test(String(color))) throw new GameError('color 는 #hex', 'INVALID');
      p.color = color;
    }
    if (team !== undefined) {
      if (team === null || team === '') p.team = null;
      else this.setTeam(id, team, { silent: true });
    }
    this.log('edit', `${p.name} 정보 수정`, { playerId: id });
    this.emitUpdate();
    return p;
  }

  /** 순서 재배열. ids 에 없는 플레이어는 뒤에 그대로 붙인다. 현재 차례 사람은 유지. */
  reorderPlayers(ids) {
    const cur = this.currentPlayer()?.id ?? null;
    const byId = new Map(this.players.map((p) => [p.id, p]));
    const next = [];
    for (const id of ids ?? []) if (byId.has(id) && !next.includes(byId.get(id))) next.push(byId.get(id));
    for (const p of this.players) if (!next.includes(p)) next.push(p);
    this.players = next;
    const idx = this.players.findIndex((p) => p.id === cur);
    this.turnIndex = idx >= 0 ? idx : 0;
    this.log('order', '순서 변경');
    this.emitUpdate();
    return this.players;
  }

  setTeam(playerId, teamName, { silent = false } = {}) {
    if (this.settings.teamMode !== 'on') throw new GameError('팀전 모드가 꺼져 있습니다 (teamMode=on)', 'TEAM_OFF');
    const p = this.getPlayer(playerId);
    if (!p) throw new GameError('플레이어를 찾을 수 없습니다', 'NOT_FOUND', 404);
    const name = String(teamName ?? '').trim().slice(0, 12);
    if (!name) throw new GameError('팀 이름이 필요합니다', 'INVALID_TEAM');
    if (!this.teams[name]) {
      const n = Object.keys(this.teams).length;
      if (n >= 6) throw new GameError('팀은 최대 6개', 'TOO_MANY_TEAMS');
      this.teams[name] = { name, color: TEAM_COLORS[n % TEAM_COLORS.length] };
    }
    p.team = name;
    p.color = this.teams[name].color;
    if (!silent) {
      this.log('team', `${p.name} → ${name}팀`, { playerId });
      this.emitUpdate();
    }
    return p;
  }

  usePass(id) {
    const p = this.getPlayer(id);
    if (!p) throw new GameError('플레이어를 찾을 수 없습니다', 'NOT_FOUND', 404);
    if (p.passes <= 0) throw new GameError('면제권이 없습니다', 'NO_PASS');
    p.passes -= 1;
    // 큐 모드면 대기 중인 본인 벌칙 하나를 면제 처리
    const pen = this.pendingPenalties(id)[0];
    if (pen) {
      pen.status = 'waived';
      pen.resolvedAt = Date.now();
      this.emit('penalty', pen);
    }
    this.log('pass', `${p.name} 면제권 사용${pen ? ` (${pen.text} 면제)` : ''}`, { playerId: id });
    this.emitUpdate();
    return p;
  }

  addDrink(playerId, amount = 1) {
    const p = this.getPlayer(playerId);
    if (!p) throw new GameError('플레이어를 찾을 수 없습니다', 'NOT_FOUND', 404);
    p.drinks += amount;
    this.log('drink', `${p.name} ${amount}잔`, { playerId });
    this.emitUpdate();
    return p;
  }

  // ======================================================================
  // 턴
  // ======================================================================

  nextTurn({ force = false } = {}) {
    if (this.players.length === 0) return null;
    let guard = 0;
    do {
      this.turnIndex += this.direction;
      if (this.turnIndex >= this.players.length) {
        this.turnIndex = 0;
        this.round += 1;
      } else if (this.turnIndex < 0) {
        this.turnIndex = this.players.length - 1;
        this.round += 1;
      }
      const p = this.currentPlayer();
      if (p.skipTurns > 0 && !force) {
        p.skipTurns -= 1;
        this.log('skip', `${p.name} 한 턴 쉬기`, { playerId: p.id });
        guard += 1;
        continue;
      }
      break;
    } while (guard < this.players.length * 2);
    this.armTurnTimer();
    this.emitUpdate();
    return this.currentPlayer();
  }

  setTurn(playerId) {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx < 0) throw new GameError('플레이어를 찾을 수 없습니다', 'NOT_FOUND', 404);
    this.turnIndex = idx;
    this.armTurnTimer();
    this.emitUpdate();
  }

  reverseOrder() {
    this.direction *= -1;
    this.log('reverse', `순서 ${this.direction > 0 ? '정방향' : '역방향'}`);
    this.emitUpdate();
    return this.direction;
  }

  /** 차례 방치 타이머 (turnMode=turn, turnTimeoutAction != none 일 때만) */
  armTurnTimer() {
    this.disarmTurnTimer();
    const { turnMode, turnTimeoutAction, turnTimeoutSec } = this.settings;
    if (!this.timersEnabled || turnMode !== 'turn' || turnTimeoutAction === 'none' || !this.currentPlayer()) return;
    this.turnDeadline = Date.now() + turnTimeoutSec * 1000;
    this.turnTimer = setTimeout(() => this.onTurnTimeout(), turnTimeoutSec * 1000);
    this.turnTimer.unref?.();
  }

  disarmTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnDeadline = null;
  }

  onTurnTimeout() {
    const p = this.currentPlayer();
    this.turnTimer = null;
    if (!p) return;
    this.emit('timeout', p);
    if (this.settings.turnTimeoutAction === 'autoroll') {
      this.log('timeout', `${p.name} 방치 → 자동 굴림`, { playerId: p.id });
      try {
        this.roll(p.id, { by: 'timeout', privileged: true });
      } catch {
        this.nextTurn();
      }
    } else {
      this.log('timeout', `${p.name} 방치 → 차례 넘김`, { playerId: p.id });
      this.nextTurn();
    }
  }

  // ======================================================================
  // 주사위 / 룰렛
  // ======================================================================

  /**
   * @param {string} playerId
   * @param {object} opts  by, privileged, forced(주사위 강제값), forcedTile(룰렛 강제 칸)
   */
  roll(playerId, { by = 'api', privileged = false, forced, forcedTile } = {}) {
    const player = this.getPlayer(playerId);
    if (!player) throw new GameError('플레이어를 찾을 수 없습니다', 'NOT_FOUND', 404);
    const s = this.settings;
    const now = Date.now();
    const isCurrent = this.currentPlayer()?.id === player.id;

    if (this.status === 'paused') throw new GameError('게임이 일시정지 상태입니다', 'PAUSED', 409);
    if (this.status === 'ended') throw new GameError('게임이 종료되었습니다. 초기화 후 다시 시작하세요', 'ENDED', 409);
    if (this.status === 'lobby') this.start({ silent: true }); // 첫 굴림이 곧 시작

    if (!privileged) {
      if (s.turnMode === 'turn') {
        if (!isCurrent) throw new GameError(`지금은 ${this.currentPlayer()?.name ?? '?'} 차례입니다`, 'NOT_YOUR_TURN');
      } else if (player.skipTurns > 0) {
        player.skipTurns -= 1;
        this.log('skip', `${player.name} 한 턴 쉬기`, { playerId: player.id });
        this.emitUpdate();
        throw new GameError('한 턴 쉽니다', 'SKIPPED');
      } else if (now - player.lastRollAt < s.rollCooldownSec * 1000) {
        const left = Math.ceil((s.rollCooldownSec * 1000 - (now - player.lastRollAt)) / 1000);
        throw new GameError(`${left}초 후에 다시 굴릴 수 있습니다`, 'COOLDOWN', 429);
      }
    }

    this.pushUndo();
    const effects = [];
    const from = player.position;
    let dice;
    let total;
    let isDouble = false;
    let tile;

    if (s.gameType === 'roulette') {
      tile = forcedTile !== undefined ? this.board[forcedTile] : this.spinTile();
      dice = [];
      total = 0;
      effects.push({ type: 'spin', text: `룰렛 → ${tile.name}` });
      this.applyTile(player, tile, effects, 0, { roulette: true });
    } else {
      dice = forced ?? Array.from({ length: s.diceCount }, () => 1 + Math.floor(this.rng() * s.diceSides));
      total = dice.reduce((a, b) => a + b, 0);
      isDouble = dice.length >= 2 && dice.every((d) => d === dice[0]);
      this.movePlayer(player, total, effects);
      tile = this.board[player.position];
    }

    // 더블 규칙
    let extraTurn = false;
    if (s.turnMode === 'turn' && isCurrent && isDouble && s.doubleRule !== 'none') {
      player.doubleStreak += 1;
      if (s.doubleRule === 'triple_jail' && player.doubleStreak >= 3) {
        player.doubleStreak = 0;
        const jail = this.board.find((t) => t.type === 'JAIL');
        if (jail) {
          player.position = jail.id;
          effects.push({ type: 'move', text: `더블 3연속! ${jail.name}(으)로` });
          this.applyTile(player, jail, effects, 1);
          tile = jail;
        } else {
          player.skipTurns += 1;
          effects.push({ type: 'jail', text: '더블 3연속! 한 턴 쉬기', skip: 1, drink: 0 });
        }
      } else {
        extraTurn = true;
      }
    } else if (!isDouble) {
      player.doubleStreak = 0;
    }

    player.rolls += 1;
    player.lastRollAt = now;

    const result = {
      id: `${now}-${Math.floor(Math.random() * 1e6)}`,
      at: now,
      by,
      gameType: s.gameType,
      playerId: player.id,
      playerName: player.name,
      team: player.team,
      dice,
      diceSides: s.diceSides,
      total,
      isDouble,
      from,
      to: player.position,
      tile,
      effects,
      extraTurn,
      summary: effects.map((e) => e.text).join(' → '),
    };
    this.lastRoll = result;
    const diceText = dice.length ? `🎲 ${dice.join('+')}=${total}` : '🎡';
    this.log('roll', `${player.name} ${diceText} → [${tile.name}] ${result.summary}`, { playerId: player.id, rollId: result.id });

    if (s.turnMode === 'turn' && isCurrent && !extraTurn) {
      this.nextTurn();
    } else {
      this.armTurnTimer();
      this.emitUpdate();
    }
    this.emit('roll', result);
    this.checkEnd(player);
    return result;
  }

  spinTile() {
    const weights = this.board.map((t) => (t.weight === undefined ? 1 : Math.max(0, t.weight)));
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) return this.board[Math.floor(this.rng() * this.board.length)];
    let r = this.rng() * sum;
    for (let i = 0; i < this.board.length; i += 1) {
      r -= weights[i];
      if (r < 0) return this.board[i];
    }
    return this.board[this.board.length - 1];
  }

  movePlayer(player, steps, effects, depth = 0) {
    const len = this.board.length;
    const raw = player.position + steps;
    const passedStart = steps > 0 && raw >= len;
    player.position = ((raw % len) + len) % len;
    if (passedStart) {
      player.laps += 1;
      player.passes += 1;
      effects.push({ type: 'lap', text: `한 바퀴 완주! 면제권 +1 (총 ${player.passes})` });
    }
    this.applyTile(player, this.board[player.position], effects, depth);
  }

  applyTile(player, tile, effects, depth, { roulette = false } = {}) {
    if (depth > 3) return;
    switch (tile.type) {
      case 'START':
        effects.push({ type: 'start', text: roulette ? '꽝! 통과' : '출발 칸' });
        break;
      case 'DRINK':
      case 'MISSION':
        this.applyPenaltyTile(player, tile, effects);
        break;
      case 'SAFE':
        player.passes += 1;
        effects.push({ type: 'safe', text: `안전! 면제권 +1 (총 ${player.passes})` });
        break;
      case 'JAIL': {
        const skip = tile.skip ?? 1;
        player.skipTurns += skip;
        if (tile.drink) this.addPenalty(player, tile.drink, [player], tile.name, effects, { kind: 'drink' });
        effects.push({ type: 'jail', text: `${skip}턴 쉬기`, skip, drink: tile.drink ?? 0 });
        break;
      }
      case 'GOLDEN_KEY': {
        const card = this.drawCard();
        effects.push({ type: 'card', text: `황금열쇠: ${card.title}`, card });
        this.applyCard(player, card, effects, depth + 1, roulette);
        break;
      }
      case 'MOVE': {
        if (roulette) {
          effects.push({ type: 'start', text: '통과' });
          break;
        }
        if (Number.isInteger(tile.goto)) {
          player.position = tile.goto;
          effects.push({ type: 'move', text: `${this.board[tile.goto].name}(으)로 이동` });
          this.applyTile(player, this.board[tile.goto], effects, depth + 1);
        } else {
          effects.push({ type: 'move', text: `${tile.steps > 0 ? '앞으로' : '뒤로'} ${Math.abs(tile.steps)}칸` });
          const len = this.board.length;
          player.position = (((player.position + tile.steps) % len) + len) % len;
          this.applyTile(player, this.board[player.position], effects, depth + 1);
        }
        break;
      }
      default:
        break;
    }
  }

  /** DRINK/MISSION 칸: 땅 소유 규칙을 거쳐 벌칙 생성 */
  applyPenaltyTile(player, tile, effects) {
    let amount = tile.drink ?? 1;
    const kind = tile.type === 'MISSION' ? 'mission' : 'drink';
    const s = this.settings;

    if (s.propertyMode === 'on' && OWNABLE_TYPES.includes(tile.type)) {
      const owner = this.ownership[tile.id];
      if (owner === player.id) {
        effects.push({ type: 'property', text: `내 땅(${tile.name}) 통과!`, tileId: tile.id, owner });
        return;
      }
      if (owner) {
        const ownerP = this.getPlayer(owner);
        amount *= s.tollMultiplier;
        effects.push({ type: 'property', text: `${ownerP?.name ?? '?'}의 땅! 통행세 ×${s.tollMultiplier}`, tileId: tile.id, owner });
      } else if (s.claimOnLand) {
        this.ownership[tile.id] = player.id;
        effects.push({ type: 'property', text: `${tile.name} 땅 획득!`, tileId: tile.id, owner: player.id });
      }
    }

    const targets = this.resolveTargets(player, tile.target ?? 'self');
    const label = kind === 'mission' ? `미션: ${tile.description ?? tile.name}` : tile.name;
    if (targets === null) {
      // 지목: 대상 미정 벌칙
      this.addPenalty(player, amount, [], label, effects, { kind, pick: true });
    } else {
      this.addPenalty(player, amount, targets, label, effects, { kind });
    }
  }

  applyCard(player, card, effects, depth, roulette = false) {
    const a = card.action ?? { type: 'none' };
    switch (a.type) {
      case 'drink': {
        const targets = this.resolveTargets(player, a.target ?? 'self');
        this.addPenalty(player, a.amount ?? 1, targets ?? [], card.title, effects, { kind: 'drink', pick: targets === null });
        break;
      }
      case 'move':
        if (roulette) break;
        effects.push({ type: 'move', text: `${a.steps > 0 ? '앞으로' : '뒤로'} ${Math.abs(a.steps)}칸` });
        this.movePlayer(player, a.steps, effects, depth + 1);
        break;
      case 'goto': {
        if (roulette) break;
        const idx = Math.min(Math.max(0, a.index ?? 0), this.board.length - 1);
        player.position = idx;
        if (a.grantPass) {
          player.passes += 1;
          effects.push({ type: 'item', text: `면제권 +1 (총 ${player.passes})` });
        }
        effects.push({ type: 'move', text: `${this.board[idx].name}(으)로 이동` });
        this.applyTile(player, this.board[idx], effects, depth + 1);
        break;
      }
      case 'item':
        player.passes += 1;
        effects.push({ type: 'item', text: `면제권 +1 (총 ${player.passes})` });
        break;
      case 'skip':
        player.skipTurns += a.turns ?? 1;
        effects.push({ type: 'jail', text: `${a.turns ?? 1}턴 쉬기`, skip: a.turns ?? 1, drink: 0 });
        break;
      default:
        effects.push({ type: 'mission', text: card.description });
    }
  }

  /** target 문자열 → 플레이어 배열. 지목(pick)은 null. */
  resolveTargets(player, target) {
    const idx = this.players.indexOf(player);
    const n = this.players.length;
    const left = n > 1 ? this.players[(idx - 1 + n) % n] : null;
    const right = n > 1 ? this.players[(idx + 1) % n] : null;
    switch (target) {
      case 'pick':
        return null;
      case 'all':
        return [...this.players];
      case 'others':
        return this.players.filter((p) => p !== player);
      case 'left':
        return [left ?? player];
      case 'right':
        return [right ?? player];
      case 'sides': {
        const t = [];
        if (left) t.push(left);
        if (right && right !== left) t.push(right);
        return t.length ? t : [player];
      }
      case 'team':
        if (this.settings.teamMode === 'on' && player.team) return this.players.filter((p) => p.team === player.team);
        return [player];
      default:
        return [player];
    }
  }

  // ======================================================================
  // 벌칙 (즉시 / 큐)
  // ======================================================================

  addPenalty(source, amount, targets, label, effects, { kind = 'drink', pick = false } = {}) {
    const s = this.settings;
    const names = pick ? '지목' : targets.map((t) => t.name).join(', ');
    const text = `${label}: ${names} ${amount}잔`;
    const effect = { type: kind, text, amount, targets: targets.map((t) => t.id), pick, penaltyIds: [] };

    if (s.penaltyMode === 'instant' && !pick) {
      for (const t of targets) t.drinks += amount;
    } else {
      // 큐 모드, 또는 지목처럼 대상 미정인 벌칙은 항상 큐에
      const list = pick ? [null] : targets;
      for (const t of list) {
        const pen = {
          id: ++this.penaltySeq,
          at: Date.now(),
          kind,
          text: label,
          amount,
          sourceId: source.id,
          sourceName: source.name,
          playerId: t?.id ?? null,
          playerName: t?.name ?? null,
          status: 'pending',
        };
        this.penalties.push(pen);
        effect.penaltyIds.push(pen.id);
        this.emit('penalty', pen);
      }
      if (this.penalties.length > 500) this.penalties.splice(0, this.penalties.length - 500);
    }
    effects.push(effect);
    return effect;
  }

  getPenalty(id) {
    const pen = this.penalties.find((p) => p.id === Number(id));
    if (!pen) throw new GameError('벌칙을 찾을 수 없습니다', 'NOT_FOUND', 404);
    return pen;
  }

  /** 대상 미정(지목) 벌칙에 대상 지정 */
  assignPenalty(id, playerId) {
    const pen = this.getPenalty(id);
    const p = this.getPlayer(playerId);
    if (!p) throw new GameError('플레이어를 찾을 수 없습니다', 'NOT_FOUND', 404);
    if (pen.status !== 'pending') throw new GameError('이미 처리된 벌칙입니다', 'DONE');
    pen.playerId = p.id;
    pen.playerName = p.name;
    this.log('assign', `${pen.sourceName} → ${p.name} 지목 (${pen.text} ${pen.amount}잔)`, { penaltyId: pen.id });
    if (this.settings.penaltyMode === 'instant') return this.completePenalty(id);
    this.emit('penalty', pen);
    this.emitUpdate();
    return pen;
  }

  completePenalty(id, { silent = false } = {}) {
    const pen = this.getPenalty(id);
    if (pen.status !== 'pending') throw new GameError('이미 처리된 벌칙입니다', 'DONE');
    if (!pen.playerId) throw new GameError('대상이 지정되지 않은 벌칙입니다. 먼저 지목하세요', 'UNASSIGNED');
    pen.status = 'done';
    pen.resolvedAt = Date.now();
    const p = this.getPlayer(pen.playerId);
    if (p) p.drinks += pen.amount;
    if (!silent) {
      this.log('done', `${pen.playerName} ${pen.text} ${pen.amount}잔 완료`, { penaltyId: pen.id, playerId: pen.playerId });
      this.emit('penalty', pen);
      this.emitUpdate();
    }
    return pen;
  }

  skipPenalty(id, reason = '스킵') {
    const pen = this.getPenalty(id);
    if (pen.status !== 'pending') throw new GameError('이미 처리된 벌칙입니다', 'DONE');
    pen.status = 'skipped';
    pen.resolvedAt = Date.now();
    this.log('skip-penalty', `${pen.playerName ?? pen.sourceName} ${pen.text} ${reason}`, { penaltyId: pen.id });
    this.emit('penalty', pen);
    this.emitUpdate();
    return pen;
  }

  // ======================================================================
  // 땅 소유
  // ======================================================================

  claimTile(playerId, tileId) {
    if (this.settings.propertyMode !== 'on') throw new GameError('땅 소유 모드가 꺼져 있습니다', 'PROPERTY_OFF');
    const p = this.getPlayer(playerId);
    const tile = this.board[tileId];
    if (!p || !tile) throw new GameError('플레이어 또는 칸을 찾을 수 없습니다', 'NOT_FOUND', 404);
    if (!OWNABLE_TYPES.includes(tile.type)) throw new GameError('소유할 수 없는 칸입니다', 'NOT_OWNABLE');
    if (this.ownership[tileId] && this.ownership[tileId] !== playerId) throw new GameError('이미 주인이 있는 땅입니다', 'OWNED');
    this.ownership[tileId] = playerId;
    this.log('property', `${p.name} ${tile.name} 땅 획득`, { playerId, tileId });
    this.emitUpdate();
    return tile;
  }

  releaseTile(tileId) {
    delete this.ownership[tileId];
    this.emitUpdate();
  }

  // ======================================================================
  // 후원 액션 (donations.js 가 호출)
  // ======================================================================

  teleport(playerId, tileId, { by = 'api' } = {}) {
    if (this.settings.gameType === 'roulette') throw new GameError('룰렛 모드에는 위치가 없습니다', 'ROULETTE');
    const p = this.getPlayer(playerId);
    if (!p) throw new GameError('플레이어를 찾을 수 없습니다', 'NOT_FOUND', 404);
    this.pushUndo();
    const idx = tileId === undefined ? Math.floor(this.rng() * this.board.length) : Math.min(Math.max(0, tileId), this.board.length - 1);
    const effects = [{ type: 'move', text: `${this.board[idx].name}(으)로 순간이동` }];
    p.position = idx;
    this.applyTile(p, this.board[idx], effects, 1);
    const result = this.pseudoRoll(p, effects, by, p.position);
    this.emit('roll', result);
    return result;
  }

  moveBy(playerId, steps, { by = 'api' } = {}) {
    if (this.settings.gameType === 'roulette') throw new GameError('룰렛 모드에는 위치가 없습니다', 'ROULETTE');
    const p = this.getPlayer(playerId);
    if (!p) throw new GameError('플레이어를 찾을 수 없습니다', 'NOT_FOUND', 404);
    this.pushUndo();
    const from = p.position;
    const effects = [{ type: 'move', text: `${steps > 0 ? '앞으로' : '뒤로'} ${Math.abs(steps)}칸` }];
    this.movePlayer(p, steps, effects);
    const result = this.pseudoRoll(p, effects, by, from);
    this.emit('roll', result);
    return result;
  }

  swapPositions(aId, bId, { by = 'api' } = {}) {
    if (this.settings.gameType === 'roulette') throw new GameError('룰렛 모드에는 위치가 없습니다', 'ROULETTE');
    const a = this.getPlayer(aId);
    const b = this.getPlayer(bId);
    if (!a || !b) throw new GameError('플레이어를 찾을 수 없습니다', 'NOT_FOUND', 404);
    this.pushUndo();
    [a.position, b.position] = [b.position, a.position];
    const effects = [{ type: 'move', text: `${a.name} ↔ ${b.name} 위치 교환` }];
    const result = this.pseudoRoll(a, effects, by, b.position);
    this.emit('roll', result);
    return result;
  }

  grantPass(playerId, n = 1) {
    const p = this.getPlayer(playerId);
    if (!p) throw new GameError('플레이어를 찾을 수 없습니다', 'NOT_FOUND', 404);
    p.passes += n;
    this.log('item', `${p.name} 면제권 +${n}`, { playerId });
    this.emitUpdate();
    return p;
  }

  /** 후원으로 직접 벌칙 부여 */
  imposePenalty(targets, amount, label, { by = 'api' } = {}) {
    const list = targets.map((id) => this.getPlayer(id)).filter(Boolean);
    if (!list.length) throw new GameError('대상이 없습니다', 'NOT_FOUND', 404);
    this.pushUndo();
    const effects = [];
    this.addPenalty(list[0], amount, list, label, effects, { kind: 'drink' });
    const result = this.pseudoRoll(list[0], effects, by, list[0].position);
    this.emit('roll', result);
    return result;
  }

  pseudoRoll(p, effects, by, from) {
    const result = {
      id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      at: Date.now(),
      by,
      gameType: this.settings.gameType,
      playerId: p.id,
      playerName: p.name,
      team: p.team,
      dice: [],
      total: 0,
      isDouble: false,
      from,
      to: p.position,
      tile: this.board[p.position],
      effects,
      extraTurn: false,
      summary: effects.map((e) => e.text).join(' → '),
    };
    this.lastRoll = result;
    this.log('action', `${p.name} ${result.summary}`, { playerId: p.id, by });
    this.emitUpdate();
    return result;
  }

  // ======================================================================
  // 되돌리기
  // ======================================================================

  pushUndo() {
    if (this.settings.undoDepth <= 0) return;
    this.undoStack.push(
      JSON.stringify({
        players: this.players,
        turnIndex: this.turnIndex,
        direction: this.direction,
        round: this.round,
        lastRoll: this.lastRoll,
        ownership: this.ownership,
        penalties: this.penalties,
        penaltySeq: this.penaltySeq,
      }),
    );
    if (this.undoStack.length > this.settings.undoDepth) this.undoStack.shift();
  }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) throw new GameError('되돌릴 기록이 없습니다', 'NO_UNDO');
    const s = JSON.parse(snap);
    // 참가/퇴장은 되돌리지 않는다: 현재 존재하는 플레이어만 복원
    for (const saved of s.players) {
      const p = this.getPlayer(saved.id);
      if (p) Object.assign(p, saved);
    }
    this.turnIndex = Math.min(s.turnIndex, Math.max(0, this.players.length - 1));
    this.direction = s.direction;
    this.round = s.round;
    this.lastRoll = s.lastRoll;
    this.ownership = s.ownership;
    this.penalties = s.penalties;
    this.penaltySeq = s.penaltySeq;
    this.log('undo', '마지막 동작 되돌림');
    this.armTurnTimer();
    this.emitUpdate();
    return this.toJSON();
  }

  // ======================================================================
  // 시뮬레이션 (확률 검증)
  // ======================================================================

  /** 현재 보드/설정으로 N 번 굴려 칸별 도착 분포와 효과 분포를 계산 */
  simulate(trials = 1000) {
    const n = Math.min(Math.max(1, trials | 0), 200_000);
    const sim = new GameEngine({ board: this.board, cards: this.cards, settings: { ...this.settings, undoDepth: 0, turnTimeoutAction: 'none', turnMode: 'free', rollCooldownSec: 0, doubleRule: 'none', maxPlayers: 30 }, rng: this.rng, timersEnabled: false });
    sim.setMaxListeners(0);
    const players = Math.max(2, Math.min(this.players.length || 2, 8));
    for (let i = 0; i < players; i += 1) sim.addPlayer({ id: `sim${i}`, name: `P${i + 1}` });
    const landing = new Array(this.board.length).fill(0);
    const effectCount = {};
    let totalDrinks = 0;
    for (let i = 0; i < n; i += 1) {
      const p = sim.players[i % players];
      const r = sim.roll(p.id, { privileged: true });
      landing[r.tile.id] += 1;
      for (const e of r.effects) {
        effectCount[e.type] = (effectCount[e.type] ?? 0) + 1;
        if ((e.type === 'drink' || e.type === 'mission') && !e.pick) totalDrinks += (e.amount ?? 0) * (e.targets?.length ?? 0);
      }
    }
    return {
      trials: n,
      players,
      gameType: this.settings.gameType,
      tiles: this.board.map((t) => ({ id: t.id, name: t.name, type: t.type, weight: t.weight ?? 1, landed: landing[t.id], percent: +((landing[t.id] / n) * 100).toFixed(2) })),
      effects: effectCount,
      avgDrinksPerRoll: +(totalDrinks / n).toFixed(3),
    };
  }

  // ======================================================================
  // 게임 진행 상태
  // ======================================================================

  start({ silent = false } = {}) {
    if (this.status === 'playing') return this.status;
    if (this.status === 'ended') throw new GameError('종료된 게임입니다. 초기화 후 시작하세요', 'ENDED', 409);
    this.status = 'playing';
    if (!this.startedAt) this.startedAt = Date.now();
    this.log('start', '게임 시작');
    this.emit('status', this.status);
    this.armTurnTimer();
    if (!silent) this.emitUpdate();
    return this.status;
  }

  pause() {
    if (this.status !== 'playing') throw new GameError('진행 중인 게임이 아닙니다', 'NOT_PLAYING', 409);
    this.status = 'paused';
    this.disarmTurnTimer();
    this.log('pause', '일시정지');
    this.emit('status', this.status);
    this.emitUpdate();
    return this.status;
  }

  resume() {
    if (this.status !== 'paused') throw new GameError('일시정지 상태가 아닙니다', 'NOT_PAUSED', 409);
    this.status = 'playing';
    this.log('resume', '재개');
    this.emit('status', this.status);
    this.armTurnTimer();
    this.emitUpdate();
    return this.status;
  }

  end(reason = '수동 종료') {
    if (this.status === 'ended') return this.summary();
    this.status = 'ended';
    this.endedAt = Date.now();
    this.endReason = reason;
    this.disarmTurnTimer();
    const summary = this.summary();
    this.log('end', `게임 종료: ${reason}`);
    this.emit('status', this.status);
    this.emit('ended', summary);
    this.emitUpdate();
    return summary;
  }

  /** 종료 조건 검사 (굴림 후 호출) */
  checkEnd(lastPlayer) {
    if (this.status !== 'playing') return false;
    const s = this.settings;
    switch (s.endCondition) {
      case 'rounds':
        if (this.round > s.endRounds) {
          this.end(`${s.endRounds}라운드 종료`);
          return true;
        }
        return false;
      case 'laps': {
        const p = this.players.find((x) => x.laps >= s.endLaps);
        if (p) {
          this.end(`${p.name} ${s.endLaps}바퀴 완주`);
          return true;
        }
        return false;
      }
      case 'drinks': {
        const p = this.players.find((x) => x.drinks >= s.endDrinks) ?? (lastPlayer?.drinks >= s.endDrinks ? lastPlayer : null);
        if (p) {
          this.end(`${p.name} ${s.endDrinks}잔 도달`);
          return true;
        }
        return false;
      }
      default:
        return false;
    }
  }

  /** 잔 수 내림차순 순위 */
  leaderboard() {
    return [...this.players]
      .sort((a, b) => b.drinks - a.drinks || b.rolls - a.rolls || a.joinedAt - b.joinedAt)
      .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, team: p.team, color: p.color, drinks: p.drinks, passes: p.passes, laps: p.laps, rolls: p.rolls }));
  }

  summary() {
    const lb = this.leaderboard();
    const totalDrinks = this.players.reduce((s, p) => s + p.drinks, 0);
    const totalRolls = this.players.reduce((s, p) => s + p.rolls, 0);
    const done = this.penalties.filter((p) => p.status === 'done').length;
    const pending = this.pendingPenalties().length;
    return {
      status: this.status,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      endReason: this.endReason,
      round: this.round,
      players: this.players.length,
      totalDrinks,
      totalRolls,
      penaltiesDone: done,
      penaltiesPending: pending,
      most: lb[0] ?? null,
      least: lb.length ? lb[lb.length - 1] : null,
      leaderboard: lb,
      teams: this.teamSummary().sort((a, b) => b.drinks - a.drinks),
    };
  }

  // ======================================================================
  // 저장/복구
  // ======================================================================

  snapshot() {
    return {
      version: 2,
      settings: this.settings,
      board: this.board,
      players: this.players,
      teams: this.teams,
      ownership: this.ownership,
      penalties: this.penalties.slice(-200),
      penaltySeq: this.penaltySeq,
      turnIndex: this.turnIndex,
      direction: this.direction,
      round: this.round,
      lastRoll: this.lastRoll,
      history: this.history.slice(-100),
      startedAt: this.startedAt,
      cards: this.cards,
      status: this.status,
      endedAt: this.endedAt,
      endReason: this.endReason,
    };
  }

  restore(snap) {
    if (!snap || snap.version !== 2) throw new GameError('복구할 수 없는 저장 형식', 'BAD_SNAPSHOT');
    this.settings = mergeSettings(defaultSettings(), snap.settings ?? {});
    this.board = validateBoard(snap.board ?? defaultBoard());
    this.players = Array.isArray(snap.players) ? snap.players : [];
    this.teams = snap.teams ?? {};
    this.ownership = snap.ownership ?? {};
    this.penalties = snap.penalties ?? [];
    this.penaltySeq = snap.penaltySeq ?? this.penalties.length;
    this.turnIndex = snap.turnIndex ?? 0;
    this.direction = snap.direction ?? 1;
    this.round = snap.round ?? 1;
    this.lastRoll = snap.lastRoll ?? null;
    this.history = snap.history ?? [];
    this.startedAt = snap.startedAt ?? Date.now();
    if (snap.cards) this.cards = validateCards(snap.cards);
    this.status = ['lobby', 'playing', 'paused', 'ended'].includes(snap.status) ? snap.status : (this.players.some((p) => p.rolls > 0) ? 'playing' : 'lobby');
    this.endedAt = snap.endedAt ?? null;
    this.endReason = snap.endReason ?? null;
    this.log('restore', '저장된 게임 복구');
    this.armTurnTimer();
    this.emitUpdate();
  }

  reset({ keepPlayers = true, keepSettings = true } = {}) {
    this.disarmTurnTimer();
    if (keepPlayers) {
      for (const p of this.players) {
        Object.assign(p, { position: 0, laps: 0, drinks: 0, passes: 0, skipTurns: 0, rolls: 0, doubleStreak: 0, lastRollAt: 0 });
      }
    } else {
      this.players = [];
      this.teams = {};
    }
    if (!keepSettings) this.settings = defaultSettings();
    this.ownership = {};
    this.penalties = [];
    this.penaltySeq = 0;
    this.undoStack = [];
    this.turnIndex = 0;
    this.direction = 1;
    this.round = 1;
    this.lastRoll = null;
    this.history = [];
    this.startedAt = null;
    this.status = 'lobby';
    this.endedAt = null;
    this.endReason = null;
    this.log('reset', '게임 초기화');
    this.emit('reset');
    this.armTurnTimer();
    this.emitUpdate();
  }

  destroy() {
    this.disarmTurnTimer();
    this.removeAllListeners();
  }

  // ======================================================================
  // 내부
  // ======================================================================

  log(type, text, extra = {}) {
    this.history.push({ at: Date.now(), type, text, ...extra });
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
  }

  emitUpdate() {
    this.emit('update', this.toJSON());
  }
}
