/** Title, pause, and the Book of Ends shell for WelCum HoMe. */
import Phaser from 'phaser';
import { TAGLINES, TITLE } from '../home/copy';
import { emptyBook, parseBook, serializeBook } from '../home/book';
import type { BookOfEnds } from '../home/types';
import { HomeScene } from '../home/home-scene';
import { openMenu, type MenuHandle } from './menus/dom';

const BOOK_KEY = 'welcum-home-book-v1';

export type HomeHost = {
  start: (book: BookOfEnds) => void;
  stop: () => void;
  setPaused: (paused: boolean) => void;
  readBook: () => BookOfEnds | null;
};

function loadBook(): BookOfEnds {
  try {
    return parseBook(localStorage.getItem(BOOK_KEY));
  } catch {
    return emptyBook();
  }
}

function storeBook(book: BookOfEnds): void {
  try {
    localStorage.setItem(BOOK_KEY, serializeBook(book));
  } catch {
    // Private mode and full disks just keep the book for this sitting.
  }
}

export function runHomeFlow(host: HomeHost): void {
  let menu: MenuHandle | null = null;
  let book = loadBook();
  const open = (next: MenuHandle) => {
    menu = next;
  };

  const style = document.createElement('style');
  style.id = 'wh-shell-style';
  style.textContent = '.wh-list{margin:8px 0;padding:0;list-style:none;font:14px/1.45 Georgia,serif}.wh-list li{margin:0 0 8px}';
  document.head.appendChild(style);

  function showBook(onBack: () => void): void {
    const el = document.createElement('div');
    el.className = 'hf-menu';
    el.id = 'wh-book';
    const panel = document.createElement('div');
    panel.className = 'hf-panel';
    const h = document.createElement('h1');
    h.textContent = 'Book of Ends';
    panel.appendChild(h);
    const list = document.createElement('ul');
    list.className = 'wh-list';
    if (book.entries.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Nothing written yet.';
      list.appendChild(li);
    }
    for (const entry of book.entries) {
      const li = document.createElement('li');
      li.textContent = `x${entry.count}  ${entry.epitaph}`;
      list.appendChild(li);
    }
    panel.appendChild(list);
    const back = document.createElement('button');
    back.className = 'hf-item';
    back.dataset.id = 'back';
    back.textContent = 'Back';
    back.addEventListener('click', () => {
      el.remove();
      onBack();
    });
    panel.appendChild(back);
    el.appendChild(panel);
    document.body.appendChild(el);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        el.remove();
        window.removeEventListener('keydown', onKey, true);
        onBack();
      }
    };
    window.addEventListener('keydown', onKey, true);
  }

  function title(): void {
    host.stop();
    book = loadBook();
    open(
      openMenu(
        TITLE,
        [
          { id: 'new', label: 'Step outside', hint: 'The plain is already awake', onPick: () => (menu?.close(), host.start(book)) },
          {
            id: 'book',
            label: 'Book of Ends',
            disabled: book.entries.length === 0,
            hint: book.entries.length === 0 ? 'Nothing written yet' : `${book.entries.length} written`,
            onPick: () => {
              menu?.close();
              showBook(title);
            },
          },
        ],
        { id: 'hf-title-menu', lines: TAGLINES, note: 'Dying is how the book gets written.' },
      ),
    );
  }

  function pause(): void {
    if (menu?.el.isConnected) return;
    if (!host.readBook()) return;
    host.setPaused(true);
    const resume = () => host.setPaused(false);
    open(
      openMenu(
        'Paused',
        [
          { id: 'resume', label: 'Get back out there', onPick: () => (menu?.close(), resume()) },
          { id: 'title', label: 'Flee to the title', hint: 'The book stays', onPick: () => (menu?.close(), title()) },
        ],
        { id: 'hf-pause-menu', onEscape: () => (menu?.close(), resume()), lines: [TAGLINES[1]], note: 'B opens the Book of Ends.' },
      ),
    );
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && host.readBook() && !document.querySelector('.hf-menu')) pause();
  });

  const menuBtn = document.createElement('button');
  menuBtn.textContent = '☰';
  menuBtn.setAttribute('aria-label', 'Menu');
  menuBtn.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:20;font:18px monospace;padding:8px 12px;color:#2c2118;background:#f4efe4;border:2px solid #3e6d8c;border-radius:2px';
  menuBtn.addEventListener('click', () => {
    if (host.readBook() && !document.querySelector('.hf-menu')) pause();
  });
  document.body.appendChild(menuBtn);
  title();
}

export function bootHomeGame(parent: HTMLElement | string, book: BookOfEnds, onReady?: (game: Phaser.Game) => void): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 640,
    height: 360,
    backgroundColor: '#f3e2b8',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scene: [HomeScene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    callbacks: {
      preBoot: (game) => {
        game.registry.set('book', book);
        game.registry.set('persistBook', (next: BookOfEnds) => storeBook(next));
        onReady?.(game);
      },
    },
  });
}
