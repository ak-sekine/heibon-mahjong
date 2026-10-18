import type { GameState, PlayerState } from '../model/game.ts';
import { createTileElement, tileLabel } from './tile-svg.ts';
const seatNames=['自分','CPU1','CPU2','CPU3'];
export function renderMelds(container: HTMLElement, player: PlayerState, game?: GameState): void {
  container.setAttribute('aria-label', `${seatNames[player.id]}の公開副露面子`);
  container.replaceChildren(...(player.melds ?? []).map((meld, index) => {
    const group=document.createElement('div');group.className='open-meld';group.setAttribute('role','group');
    const direction=(meld.fromPlayerId-player.id+4)%4;
    group.dataset.fromDirection=String(direction);
    group.setAttribute('aria-label',`${({pon:'ポン',chi:'チー',ankan:'暗カン',daiminkan:'大明カン',kakan:'加カン'})[meld.type]}${meld.type==='ankan'?'':`・${seatNames[meld.fromPlayerId]}から`}`);
    // Source-relative called tile position: shimocha right, toimen middle, kamicha left.
    group.dataset.meldType=meld.type;
    if(meld.type==='ankan') {
      const concealedTiles=[...meld.tiles];
      const red=concealedTiles.findIndex(t=>t.tile.isRed);
      if(red!==-1) [concealedTiles[1],concealedTiles[red]]=[concealedTiles[red],concealedTiles[1]];
      concealedTiles.forEach((physical,index)=>{
        const item=document.createElement('span');
        if(index===0 || index===3) {item.className='concealed-kan-back';item.setAttribute('aria-label','裏向き牌');}
        else {item.dataset.tileId=physical.id;item.append(createTileElement(physical.tile));}
        group.append(item);
      });return group;
    }
    const own=meld.tiles.filter(t=>t.id!==meld.calledTileId && (meld.type!=='kakan' || t.id!==meld.addedTileId));
    const called=meld.tiles.find(t=>t.id===meld.calledTileId)!;
    const arranged=[...own];
    const calledIndex = meld.type==='chi' ? meld.tiles.findIndex(t=>t.id===called.id) : direction===3?0:direction===2?1:own.length;
    // Sequence tiles arrive in numeric order from GameState; preserve it.
    arranged.splice(calledIndex,0,called);
    group.style.setProperty('--called-offset', `calc(${calledIndex} * (var(--meld-tile-width) + 1px))`);
    if(meld.type==='kakan') arranged.push(meld.tiles.find(t=>t.id===meld.addedTileId)!);
    for(const physical of arranged) {
      const item=document.createElement('span');item.dataset.tileId=physical.id;
      item.className=physical.id===meld.calledTileId?'called-tile':'';
      if(meld.type==='kakan' && physical.id===meld.addedTileId) item.classList.add('added-kan-tile');
      item.append(createTileElement(physical.tile));group.append(item);
    }
    const pending = game?.phase === 'awaiting-ron' && game.ronWindow?.kind === 'kakan'
      ? game.ronWindow.kan : null;
    if (meld.type === 'pon' && pending?.playerId === player.id && pending.meldIndex === index) {
      group.dataset.kanPending = 'true';
      const preview = document.createElement('span');
      preview.setAttribute('role', 'img');
      preview.className = 'added-kan-tile pending-kan-tile';
      // Preview only: never expose a concealed physical ID or mutate the meld.
      preview.setAttribute('aria-label', `加カン宣言中：${tileLabel(pending.tile.tile)}`);
      const svg = createTileElement(pending.tile.tile);
      svg.setAttribute('aria-hidden', 'true');
      preview.append(svg);
      group.append(preview);
      group.append(previewText('small', '加カン宣言中'));
    }
    return group;
  }));
}

function previewText(tag: string, value: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}
