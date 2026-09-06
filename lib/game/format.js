/**
 * 서버(채팅 응답)·오버레이·사이트 데모가 공유하는 순수 함수.
 * DOM·Node 의존이 없어 어디서든 import 된다.
 */

/**
 * 보드 길이 → 정사각 링 좌표 (CSS grid 1-based row/col).
 * 한 변 n칸이면 총 4(n-1)칸을 담고, 남는 자리는 비운다.
 * 0번 칸이 오른쪽 아래, 아래줄은 오른잡→왼쪽, 왼쪽줄은 아래→위, 윗줄은 왼쪽→오른쪽, 오른쪽줄은 위→아래.
 */
export function ringCoords(len) {
  const n = Math.max(3, Math.ceil(len / 4) + 1);
  const coords = [];
  for (let i = 0; i < len; i += 1) {
    const side = Math.floor(i / (n - 1));
    const k = i % (n - 1);
    let r;
    let c;
    if (side === 0) { r = n - 1; c = n - 1 - k; }
    else if (side === 1) { r = n - 1 - k; c = 0; }
    else if (side === 2) { r = 0; c = k; }
    else { r = k; c = n - 1; }
    coords.push({ r: r + 1, c: c + 1 });
  }
  return { n, coords };
}

/** 굴림 결과 한 줄 요약 (채팅 응답·기록·데모 공통) */
export function formatRoll(r, prefix = '') {
  const head = prefix ? `${prefix} → ` : '';
  const dice = r.dice?.length ? `🎲 ${r.dice.join('+')}=${r.total} → ` : r.gameType === 'roulette' ? '🎡 ' : '';
  const extra = r.extraTurn ? ' (더블! 한 번 더)' : '';
  return `${head}${r.playerName} ${dice}[${r.tile.name}] ${r.summary}${extra}`;
}

/** HTML 이스케이프 (오버레이·데모·관리 페이지 공통) */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** "1d20" 표기 */
export function diceLabel(settings) {
  return settings.gameType === 'roulette' ? '룰렛' : `${settings.diceCount}d${settings.diceSides}`;
}
