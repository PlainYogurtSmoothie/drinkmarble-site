/**
 * 황금열쇠 카드
 * action.type:
 *   drink  { amount, target }   마시기
 *   move   { steps }            상대 이동 (도착 칸 효과 적용)
 *   goto   { index }            절대 이동 (도착 칸 효과 적용)
 *   item   { item: 'pass' }     면제권 획득
 *   skip   { turns }            턴 쉬기
 *   none                        효과 없음(꽝/미션 안내)
 */
import { GameError } from './errors.js';

export const CARD_ACTIONS = ['drink', 'move', 'goto', 'item', 'skip', 'none'];
export const CARD_TARGETS = ['self', 'pick', 'left', 'right', 'sides', 'all', 'team', 'others'];

export function validateCards(cards) {
  const bad = (m) => new GameError(m, 'INVALID_CARDS', 400);
  if (!Array.isArray(cards) || cards.length < 1) throw bad('카드는 최소 1장 이상이어야 합니다');
  if (cards.length > 100) throw bad('카드는 최대 100장');
  return cards.map((c, i) => {
    if (!c || typeof c.title !== 'string' || !c.title.trim()) throw bad(`${i}번 카드: title 이 필요합니다`);
    const a = c.action ?? { type: 'none' };
    if (!CARD_ACTIONS.includes(a.type)) throw bad(`${i}번 카드: action.type 은 ${CARD_ACTIONS.join('|')}`);
    if (a.type === 'drink') {
      if (!CARD_TARGETS.includes(a.target ?? 'self')) throw bad(`${i}번 카드: target 오류`);
      if (a.amount !== undefined && !(Number.isInteger(a.amount) && a.amount >= 0)) throw bad(`${i}번 카드: amount 오류`);
    }
    if (a.type === 'move' && !Number.isInteger(a.steps)) throw bad(`${i}번 카드: move 는 steps 정수가 필요합니다`);
    if (a.type === 'goto' && !(Number.isInteger(a.index) && a.index >= 0)) throw bad(`${i}번 카드: goto 는 index 가 필요합니다`);
    if (a.type === 'skip' && a.turns !== undefined && !(Number.isInteger(a.turns) && a.turns >= 1)) throw bad(`${i}번 카드: turns 오류`);
    if (c.weight !== undefined && !(Number.isFinite(c.weight) && c.weight >= 0)) throw bad(`${i}번 카드: weight 오류`);
    return { id: i, title: c.title.trim().slice(0, 30), description: String(c.description ?? '').slice(0, 80), action: a, ...(c.weight !== undefined ? { weight: c.weight } : {}) };
  });
}

export function defaultCards() {
  return [
    { title: '면제권 획득', description: '원샷 면제권 1개 획득!', action: { type: 'item', item: 'pass' } },
    { title: '앞으로 3칸', description: '앞으로 3칸 이동', action: { type: 'move', steps: 3 } },
    { title: '뒤로 2칸', description: '뒤로 2칸 이동', action: { type: 'move', steps: -2 } },
    { title: '무인도 직행', description: '무인도로 이동해 한 턴 쉬기', action: { type: 'goto', index: 6 } },
    { title: '전원 건배', description: '모두 한 잔!', action: { type: 'drink', amount: 1, target: 'all' } },
    { title: '지목 2샷', description: '한 명 지목해서 2잔', action: { type: 'drink', amount: 2, target: 'pick' } },
    { title: '본인 원샷', description: '꽝! 본인 원샷', action: { type: 'drink', amount: 1, target: 'self' } },
    { title: '양옆 원샷', description: '왼쪽/오른쪽 사람 한 잔씩', action: { type: 'drink', amount: 1, target: 'sides' } },
    { title: '한 턴 휴식', description: '다음 턴 쉬기 (마시지 않음)', action: { type: 'skip', turns: 1 } },
    { title: '출발점으로', description: '출발점으로 이동, 면제권 1개', action: { type: 'goto', index: 0, grantPass: true } },
    { title: '노래 한 곡', description: '한 소절 부르기. 거부 시 한 잔', action: { type: 'none' } },
    { title: '애교 3종', description: '애교 3개, 실패 시 한 잔', action: { type: 'none' } },
  ];
}
