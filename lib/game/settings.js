import { GameError } from './errors.js';

/**
 * 게임 설정 스키마.
 *
 * 서로 충돌하는 규칙은 하나의 enum 그룹으로 묶어 동시에 켜질 수 없게 했고,
 * 그룹 간 충돌(예: 룰렛 모드 + 땅 소유)은 CONFLICTS 로 검사해 409 로 거절한다.
 */
export const ENUMS = {
  gameType: {
    label: '게임 종류',
    options: {
      marble: '마블: 말이 보드를 돌며 도착 칸 효과 적용',
      roulette: '룰렛: 위치 없이 매 굴림마다 칸을 확률(weight)로 추첨',
    },
  },
  turnMode: {
    label: '차례 방식',
    options: {
      turn: '순서제: 한 명씩 차례대로',
      free: '자유: 각자 자기 말을 아무 때나 (쿨다운 적용)',
    },
  },
  doubleRule: {
    label: '더블 규칙',
    options: {
      extra_turn: '더블이면 한 번 더',
      none: '더블 무시',
      triple_jail: '더블이면 한 번 더, 연속 3번이면 무인도',
    },
  },
  penaltyMode: {
    label: '벌칙 처리',
    options: {
      instant: '즉시: 잔 수를 바로 집계',
      queue: '큐(키핑): 벌칙을 대기열에 쌓고 !완료 처리 시 집계',
    },
  },
  turnTimeoutAction: {
    label: '차례 방치 시',
    options: {
      none: '아무것도 안 함',
      skip: 'turnTimeoutSec 뒤 자동으로 다음 사람',
      autoroll: 'turnTimeoutSec 뒤 자동으로 굴림',
    },
  },
  propertyMode: {
    label: '땅 소유(부루마블식)',
    options: {
      off: '끔',
      on: '벌칙 칸에 처음 도착한 사람이 땅 소유. 본인 땅은 통과, 남의 땅은 통행세(벌칙 2배)',
    },
  },
  teamMode: {
    label: '팀전',
    options: {
      off: '끔',
      on: '플레이어를 팀에 배정. 팀 합산 집계, target "team" 사용 가능',
    },
  },
  donationFallback: {
    label: '규칙에 안 걸린 후원',
    options: {
      roll: 'donationRollAmount 이상이면 주사위 굴림',
      none: '무시',
    },
  },
  anonymousDonation: {
    label: '익명 후원',
    options: {
      allow: '허용 (1인 한도는 적용 불가)',
      deny: '무시',
    },
  },
  endCondition: {
    label: '게임 종료 조건',
    options: {
      none: '수동 종료만',
      rounds: 'endRounds 라운드가 끝나면 종료',
      laps: '누가 endLaps 바퀴를 완주하면 종료 (마블 전용)',
      drinks: '누가 endDrinks 잔에 도달하면 종료',
    },
  },
};

export const NUMBERS = {
  diceCount: { label: '주사위 개수', min: 1, max: 3, default: 2 },
  diceSides: { label: '주사위 면 수 (6=일반, 12, 20 …)', min: 2, max: 100, default: 6 },
  maxPlayers: { label: '최대 인원', min: 1, max: 30, default: 8 },
  rollCooldownSec: { label: '자유 모드 재굴림 간격(초)', min: 0, max: 3600, default: 30 },
  turnTimeoutSec: { label: '차례 방치 제한(초)', min: 5, max: 3600, default: 90 },
  donationRollAmount: { label: '후원 굴림 기준 금액(원)', min: 0, max: 10_000_000, default: 1000 },
  donationMaxChain: { label: '한 후원으로 최대 연속 굴림', min: 1, max: 20, default: 3 },
  donationPerUserDaily: { label: '1인 하루 후원 액션 한도 (0=무제한)', min: 0, max: 1000, default: 0 },
  donationCooldownSec: { label: '같은 사람 후원 액션 간격(초)', min: 0, max: 3600, default: 0 },
  tollMultiplier: { label: '통행세 배수', min: 1, max: 5, default: 2 },
  undoDepth: { label: '되돌리기 저장 개수', min: 0, max: 50, default: 20 },
  endRounds: { label: '종료 라운드 수', min: 1, max: 100, default: 10 },
  endLaps: { label: '종료 완주 바퀴 수', min: 1, max: 20, default: 3 },
  endDrinks: { label: '종료 잔 수', min: 1, max: 100, default: 10 },
};

export const BOOLEANS = {
  allowViewerRoll: { label: '시청자 !주사위 허용', default: true },
  autosave: { label: '상태 자동 저장(재시작 복구)', default: true },
  claimOnLand: { label: '땅 소유 모드: 도착 시 자동 획득 (false 면 !구매)', default: true },
};

/** 그룹 간 충돌. when 이 모두 맞으면 거절. */
export const CONFLICTS = [
  { when: { diceCount: 1, doubleRule: 'extra_turn' }, message: '주사위가 1개면 더블이 나올 수 없습니다. doubleRule=none 으로 설정하세요' },
  { when: { diceCount: 1, doubleRule: 'triple_jail' }, message: '주사위가 1개면 더블이 나올 수 없습니다. doubleRule=none 으로 설정하세요' },
  { when: { gameType: 'roulette', propertyMode: 'on' }, message: '룰렛 모드에서는 땅 소유(propertyMode)를 켤 수 없습니다' },
  { when: { gameType: 'roulette', doubleRule: 'triple_jail' }, message: '룰렛 모드에는 무인도 이동이 없어 triple_jail 을 쓸 수 없습니다' },
  { when: { gameType: 'roulette', endCondition: 'laps' }, message: '룰렛 모드에는 완주가 없어 endCondition=laps 를 쓸 수 없습니다' },
  { when: { turnMode: 'free', turnTimeoutAction: 'skip' }, message: '자유 모드에는 차례가 없어 방치 스킵을 쓸 수 없습니다' },
  { when: { turnMode: 'free', turnTimeoutAction: 'autoroll' }, message: '자유 모드에는 차례가 없어 자동 굴림을 쓸 수 없습니다' },
  { when: { turnMode: 'free', doubleRule: 'extra_turn' }, message: '자유 모드에는 차례가 없어 더블 추가 턴이 의미 없습니다. doubleRule=none 으로 설정하세요' },
  { when: { turnMode: 'free', doubleRule: 'triple_jail' }, message: '자유 모드에서는 triple_jail 을 쓸 수 없습니다' },
];

export function defaultSettings() {
  const s = {};
  for (const [k, v] of Object.entries(ENUMS)) s[k] = Object.keys(v.options)[0];
  for (const [k, v] of Object.entries(NUMBERS)) s[k] = v.default;
  for (const [k, v] of Object.entries(BOOLEANS)) s[k] = v.default;
  s.donationRules = []; // src/donations.js 참고
  return s;
}

/** 기존 설정에 patch 를 덧씌운 뒤 검증. 실패 시 GameError(400/409). */
export function mergeSettings(current, patch) {
  const next = { ...current };
  const errors = [];
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (k in ENUMS) {
      if (!(v in ENUMS[k].options)) errors.push(`${k}: 허용값 ${Object.keys(ENUMS[k].options).join('|')}`);
      else next[k] = v;
    } else if (k in NUMBERS) {
      const n = Number(v);
      const { min, max } = NUMBERS[k];
      if (!Number.isFinite(n) || n < min || n > max) errors.push(`${k}: ${min}~${max} 사이 숫자`);
      else next[k] = Math.round(n);
    } else if (k in BOOLEANS) {
      next[k] = v === true || v === 'true' || v === 1 || v === '1';
    } else if (k === 'donationRules') {
      if (!Array.isArray(v)) errors.push('donationRules: 배열이어야 합니다');
      else next[k] = v.map((r, i) => normalizeRule(r, i, errors));
    } else {
      errors.push(`${k}: 알 수 없는 설정`);
    }
  }
  if (errors.length) throw new GameError(errors.join('; '), 'INVALID_SETTINGS', 400);

  const conflicts = CONFLICTS.filter((c) => Object.entries(c.when).every(([k, v]) => next[k] === v));
  if (conflicts.length) {
    const err = new GameError(conflicts.map((c) => c.message).join(' / '), 'SETTINGS_CONFLICT', 409);
    err.conflicts = conflicts.map((c) => ({ when: c.when, message: c.message }));
    throw err;
  }
  return next;
}

const RULE_MATCH = ['min', 'exact', 'keyword'];
const RULE_ACTIONS = ['roll', 'move', 'teleport', 'drink', 'shield', 'swap', 'reverse', 'skip', 'penalty'];
const RULE_TARGETS = ['current', 'donor', 'random', 'all', 'pick'];

function normalizeRule(r, i, errors) {
  const rule = {
    id: String(r.id ?? `rule${i + 1}`),
    name: String(r.name ?? r.id ?? `규칙 ${i + 1}`).slice(0, 40),
    match: { type: r.match?.type ?? 'min', amount: Number(r.match?.amount ?? 0), keyword: String(r.match?.keyword ?? '').trim() },
    action: { type: r.action?.type ?? 'roll', ...r.action },
    target: r.target ?? 'current',
    chain: r.chain !== false, // min 타입에서 배수만큼 반복할지
    enabled: r.enabled !== false,
  };
  if (!RULE_MATCH.includes(rule.match.type)) errors.push(`donationRules[${i}].match.type: ${RULE_MATCH.join('|')}`);
  if (rule.match.type !== 'keyword' && !(rule.match.amount > 0)) errors.push(`donationRules[${i}].match.amount: 0 보다 커야 합니다`);
  if (rule.match.type === 'keyword' && !rule.match.keyword) errors.push(`donationRules[${i}].match.keyword 가 필요합니다`);
  if (!RULE_ACTIONS.includes(rule.action.type)) errors.push(`donationRules[${i}].action.type: ${RULE_ACTIONS.join('|')}`);
  if (!RULE_TARGETS.includes(rule.target)) errors.push(`donationRules[${i}].target: ${RULE_TARGETS.join('|')}`);
  return rule;
}

/**
 * "1d20", "2d6", "3d12" 같은 표기를 설정 패치로 변환.
 * 주사위 1개면 더블 규칙을 none 으로 함께 내린다 (충돌 방지).
 */
export function parseDiceSpec(spec, current = {}) {
  const m = /^(\d{1,2})\s*[dD]\s*(\d{1,3})$/.exec(String(spec ?? '').trim());
  if (!m) throw new GameError('주사위 표기는 "1d20", "2d6" 형식입니다', 'INVALID_DICE_SPEC', 400);
  const diceCount = Number(m[1]);
  const diceSides = Number(m[2]);
  const patch = { diceCount, diceSides };
  if (diceCount === 1 && current.doubleRule && current.doubleRule !== 'none') patch.doubleRule = 'none';
  return patch;
}

/** 클라이언트가 UI 를 그릴 수 있게 스키마를 그대로 노출 */
export function settingsSchema() {
  return { enums: ENUMS, numbers: NUMBERS, booleans: BOOLEANS, conflicts: CONFLICTS, ruleMatch: RULE_MATCH, ruleActions: RULE_ACTIONS, ruleTargets: RULE_TARGETS };
}
