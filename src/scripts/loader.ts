import gsap from "gsap";

/**
 * ローディング。縦ルーバー（縦格子）の割り付けを画面に持ち込む、という
 * 一つの発想だけで通す。
 *
 *   一．地の色（bg）に、主色（primary）の格子が上下から互い違いに滑り込んで閉じる
 *   二．差し色（accent）の罫が中央から一本引かれる
 *   三．サイト名が罫の下から一字ずつ落ちてくる
 *   四．罫が右へ抜け、字が上へ抜け、格子ごと引き上がって本編が出る
 *
 * 初回訪問のみフルで見せる。同一セッション内のページ遷移では出さない
 * （静的マルチページなので、毎回2秒待たせると導線が死ぬ）。
 */

const SESSION_KEY = "site:seen-loader";

export function initLoader(): Promise<void> {
  const root = document.documentElement;
  const loader = document.querySelector<HTMLElement>("[data-loader]");

  const finish = () => {
    root.classList.remove("is-loading");
    loader?.remove();
  };

  if (!loader) {
    root.classList.remove("is-loading");
    return Promise.resolve();
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seen = sessionStorage.getItem(SESSION_KEY) === "1";

  // 2回目以降、または動きを減らす設定なら、待たせずに畳む。
  if (seen || reduced) {
    return new Promise((resolve) => {
      gsap.to(loader, {
        autoAlpha: 0,
        duration: reduced ? 0.2 : 0.3,
        ease: "power2.out",
        onComplete: () => {
          finish();
          resolve();
        },
      });
    });
  }

  sessionStorage.setItem(SESSION_KEY, "1");

  const bars = gsap.utils.toArray<HTMLElement>("[data-loader-bar]");
  const rule = loader.querySelector<HTMLElement>("[data-loader-rule]")!;
  const chars = gsap.utils.toArray<HTMLElement>("[data-loader-char]");
  const meta = loader.querySelector<HTMLElement>("[data-loader-meta]");

  // CSS で置いた初期位置は「スクリプトが動くまで地が見えない」ためのもので、
  // GSAP は matrix から yPercent を復元できない（px の y として読む）。
  // ここで同じ状態を GSAP の単位で置き直してから動かす。
  gsap.set(bars, { y: 0, yPercent: (i) => (i % 2 === 0 ? -100 : 100) });
  gsap.set(chars, { y: 0, yPercent: 118 });
  gsap.set(rule, { scaleX: 0, transformOrigin: "center center" });
  gsap.set(meta, { opacity: 0 });

  return new Promise((resolve) => {
    const tl = gsap.timeline({
      defaults: { ease: "power3.out" },
      onComplete: () => {
        finish();
        resolve();
      },
    });

    tl
      // 一．格子が閉じる。中央から外へ順に、上下互い違いに。
      .to(bars, {
        yPercent: 0,
        duration: 0.7,
        ease: "power4.inOut",
        stagger: { each: 0.032, from: "center" },
      })
      // 二．差し色（accent）の罫。
      .to(rule, { scaleX: 1, duration: 0.6, ease: "power4.inOut" }, "-=0.34")
      // 三．サイト名。字ごとに overflow で切ってあるので、罫の下から現れる。
      .to(
        chars,
        { yPercent: 0, duration: 0.8, ease: "power4.out", stagger: 0.055 },
        "-=0.3",
      )
      .to(meta, { opacity: 1, duration: 0.45 }, "-=0.3")
      // 四．退場。罫が右へ抜け、字が上へ抜ける。
      .to(
        rule,
        { scaleX: 0, transformOrigin: "right center", duration: 0.42 },
        "+=0.16",
      )
      .to(
        [...chars, meta],
        { yPercent: -130, opacity: 0, duration: 0.5, stagger: 0.028 },
        "-=0.34",
      )
      // 格子が引き上がって、下のページが現れる。
      .to(
        bars,
        {
          scaleY: 0,
          transformOrigin: "top center",
          duration: 0.72,
          ease: "power4.inOut",
          stagger: { each: 0.032, from: "start" },
        },
        "-=0.22",
      )
      .set(loader, { autoAlpha: 0 });
  });
}
