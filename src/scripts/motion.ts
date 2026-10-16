import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * スクロールに合わせた動き。演出は4種類だけに絞る。
 *
 *   data-reveal        文字・箱がわずかに持ち上がって現れる
 *   data-reveal-child  直下の子を順に出す（並んだ項目用）
 *   data-rule          罫線が左から引かれる
 *   data-img-reveal    写真が下から現れ、同時に寄りが戻る
 *
 * どれも「速く始まって静かに止まる」。跳ねたり回したりはしない。
 */

const EASE = "power3.out";

export function initMotion(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // CSS 側で初期状態を無効化済み。ScrollTrigger も張らない。
    return;
  }

  const trigger = (el: Element, start = "top 86%") => ({
    trigger: el,
    start,
    once: true,
  });

  gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: Number(el.dataset.revealY ?? 26) },
      {
        opacity: 1,
        y: 0,
        duration: 1.0,
        ease: EASE,
        delay: Number(el.dataset.revealDelay ?? 0),
        scrollTrigger: trigger(el),
      },
    );
  });

  gsap.utils.toArray<HTMLElement>("[data-reveal-child]").forEach((el) => {
    gsap.fromTo(
      Array.from(el.children),
      { opacity: 0, y: 26 },
      {
        opacity: 1,
        y: 0,
        duration: 0.95,
        ease: EASE,
        stagger: Number(el.dataset.revealChild || 0.09),
        scrollTrigger: trigger(el),
      },
    );
  });

  gsap.utils.toArray<HTMLElement>("[data-rule]").forEach((el) => {
    gsap.fromTo(
      el,
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: 1.05,
        ease: "power3.inOut",
        scrollTrigger: trigger(el, "top 92%"),
      },
    );
  });

  gsap.utils.toArray<HTMLElement>("[data-img-reveal]").forEach((el) => {
    const inner = el.querySelector<HTMLElement>("[data-img-inner]");
    const tl = gsap.timeline({ scrollTrigger: trigger(el, "top 88%") });
    tl.fromTo(
      el,
      { clipPath: "inset(0 0 100% 0)" },
      { clipPath: "inset(0 0 0% 0)", duration: 1.15, ease: EASE },
    );
    if (inner) {
      // 幕が上がるあいだ、写真側はゆっくり引く。二つが同時に止まる。
      tl.fromTo(
        inner,
        { scale: 1.09 },
        { scale: 1, duration: 1.5, ease: EASE },
        0,
      );
    }
  });

  // ヘッダー。下へ動かすと隠し、上へ動かすと出す。天面では常に出す。
  const header = document.querySelector<HTMLElement>("[data-header]");
  if (header) {
    let last = window.scrollY;
    let hidden = false;
    ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: () => {
        const y = window.scrollY;
        const down = y > last && y > 240;
        last = y;
        if (down === hidden) return;
        hidden = down;
        gsap.to(header, {
          yPercent: down ? -100 : 0,
          duration: 0.45,
          ease: "power3.out",
        });
      },
    });
  }

  // 画像の読み込みで高さが変われば、開始位置を測り直す。
  window.addEventListener("load", () => ScrollTrigger.refresh());
}
