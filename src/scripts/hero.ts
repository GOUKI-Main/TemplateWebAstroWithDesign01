import gsap from "gsap";

/**
 * ヒーローの写真カルーセル。
 *
 * 割り付けはローダーと同じ縦ルーバー。単色の格子が上から下りて写真を覆い、
 * 覆われているあいだに次の一枚へ差し替え、そのまま下へ抜ける。写真の側は
 * ゆっくり引くだけ（transform 一つ）。
 *
 * 毎フレーム動くのは「単色の帯 10 枚」と「写真 1 枚の寄り」だけで、どちらも
 * 合成のみ。写真を格子ごとに切って一枚ずつ切り抜く（clip-path）作りに比べ、
 * 一フレームあたりの描き直しが桁で減る。
 *
 * 送りは自動。ただし画面外・別タブでは止める。動きを減らす設定では回さず、
 * 一枚目を静止画として置き、目印を押したときだけ差し替える。
 */

/** 一枚の持ち時間（秒）。 */
const INTERVAL = 6.4;
/** 格子が下りきる／抜けきるまで。 */
const SWEEP = 0.56;
/** 格子ごとの遅れ。 */
const BAR_STAGGER = 0.042;
/** 覆いきってから抜け始めるまでの間。 */
const HOLD = 0.12;
/** 写真の寄り。出た時点がいちばん寄っていて、そこから静かに戻る。 */
const ZOOM = 1.1;

export function initHero(): void {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return;

  const pick = (selector: string, root: ParentNode = hero) =>
    gsap.utils.toArray<HTMLElement>(selector, root);

  const slides = pick("[data-hero-slide]");
  if (!slides.length) return;

  const bars = pick("[data-hero-bar]");
  const captions = pick("[data-hero-caption]");
  const metas = pick("[data-hero-meta]");
  const dots = pick("[data-hero-dot]");
  const fills = pick("[data-hero-dot-fill]");
  const odometer = hero.querySelector<HTMLElement>("[data-hero-odo]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 二枚目以降は、一枚目が出てから読ませる。まとめて渡すと復号が固まって
  // 一瞬跳ねるので、一枚ずつ復号を待ってから背景に渡す。
  let loading = false;
  const loadRest = async () => {
    if (loading) return;
    loading = true;
    const wide = window.matchMedia("(min-width: 48rem)").matches;
    for (const slide of slides) {
      const { bgSm, bgLg } = slide.dataset;
      if (!bgSm || !bgLg) continue;
      try {
        const img = new Image();
        img.src = wide ? bgLg : bgSm;
        await img.decode();
      } catch {
        // 復号できなくても、表示そのものは試みる。
      }
      slide.style.setProperty("--img-sm", `url(${bgSm})`);
      slide.style.setProperty("--img-lg", `url(${bgLg})`);
    }
  };

  let current = 0;
  let inView = true;
  let curtain: gsap.core.Timeline | null = null;
  let zoom: gsap.core.Tween | null = null;
  let progress: gsap.core.Tween | null = null;

  /** 写真名と所在地の差し替え。出ていくものは上へ、来るものは下から。 */
  const swap = (items: HTMLElement[], index: number, previous: number) => {
    items.forEach((el, i) => {
      const active = i === index;
      el.setAttribute("aria-hidden", active ? "false" : "true");
      if (el instanceof HTMLAnchorElement) el.tabIndex = active ? 0 : -1;

      gsap.killTweensOf(el);
      if (reduced) {
        gsap.set(el, { opacity: active ? 1 : 0, yPercent: 0 });
        return;
      }
      if (active) {
        gsap.fromTo(
          el,
          { yPercent: 110, opacity: 0 },
          { yPercent: 0, opacity: 1, duration: 0.8, ease: "power3.out" },
        );
      } else {
        gsap.to(el, {
          yPercent: i === previous ? -110 : 110,
          opacity: 0,
          duration: 0.55,
          ease: "power3.in",
        });
      }
    });
  };

  /** 差し替え。格子が覆っているあいだに、ここが一度に起きる。 */
  const settle = (index: number, previous: number) => {
    slides.forEach((slide, i) =>
      gsap.set(slide, { visibility: i === index ? "visible" : "hidden" }),
    );

    zoom?.kill();
    zoom = reduced
      ? null
      : gsap.fromTo(
          slides[index],
          { scale: ZOOM },
          { scale: 1, duration: INTERVAL + 3, ease: "none" },
        );

    swap(captions, index, previous);
    swap(metas, index, previous);

    if (odometer && slides.length > 1) {
      gsap.to(odometer, {
        yPercent: (-100 / slides.length) * index,
        duration: reduced ? 0 : 0.85,
        ease: "power3.inOut",
      });
    }

    dots.forEach((dot, i) =>
      dot.setAttribute("aria-current", i === index ? "true" : "false"),
    );
    fills.forEach((fill, i) => {
      if (i !== index) gsap.set(fill, { scaleX: 0 });
    });

    if (reduced || !fills[index]) return;

    // 差し色（accent）の罫が引き終わったら次へ。持ち時間と目盛りが常に一致する。
    progress = gsap.fromTo(
      fills[index],
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: INTERVAL,
        ease: "none",
        onComplete: () => show((index + 1) % slides.length),
      },
    );
    if (!inView || document.hidden) progress.pause();
  };

  const show = (index: number, intro = false) => {
    const previous = current;
    current = index;

    curtain?.kill();
    progress?.kill();

    if (reduced) {
      settle(index, previous);
      return;
    }

    curtain = gsap.timeline();

    // 一．格子が下りて写真を覆う（初回は覆った位置から始まっているので省く）。
    if (!intro) {
      curtain.to(bars, {
        yPercent: 0,
        duration: SWEEP,
        ease: "power4.inOut",
        stagger: { each: BAR_STAGGER, from: "start" },
      });
    } else {
      curtain.set(bars, { y: 0, yPercent: 0 });
    }

    // 二．覆われているあいだに差し替える。
    curtain.add(() => settle(index, previous));

    // 三．そのまま下へ抜け、次に備えて上へ戻しておく。
    curtain
      .to(
        bars,
        {
          yPercent: 100,
          duration: SWEEP,
          ease: "power4.inOut",
          stagger: { each: BAR_STAGGER, from: "start" },
        },
        intro ? 0 : `+=${HOLD}`,
      )
      .set(bars, { yPercent: -100 });
  };

  /** 見出しと導線。格子が抜けるのに合わせて、下から順に起こす。 */
  const intro = () => {
    const fades = pick("[data-hero-fade]");
    const lines = pick("[data-hero-line]");
    const accent = pick("[data-hero-accent]");

    if (reduced) {
      gsap.set([...fades, ...lines, ...accent], {
        opacity: 1,
        y: 0,
        yPercent: 0,
        scaleX: 1,
      });
      return;
    }

    // CSS で置いた初期位置は「スクリプトが動くまで見せない」ためのもので、
    // GSAP は translateY(%) を matrix から yPercent に戻せない（px の y として
    // 読む）。ここで同じ状態を GSAP の単位で置き直してから動かす。
    gsap.set(lines, { y: 0, yPercent: 112 });
    gsap.set(accent, { scaleX: 0, transformOrigin: "left center" });

    gsap
      .timeline({ defaults: { ease: "power3.out" } })
      .fromTo(
        fades,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.0, stagger: 0.16 },
        0.45,
      )
      .to(
        lines,
        { yPercent: 0, duration: 1.2, ease: "power4.out", stagger: 0.12 },
        0.55,
      )
      .to(accent, { scaleX: 1, duration: 0.8, ease: "power4.inOut" }, 0.75);
  };

  const setPaused = (value: boolean) => {
    if (value) {
      progress?.pause();
      zoom?.pause();
      curtain?.pause();
    } else {
      progress?.resume();
      zoom?.resume();
      curtain?.resume();
    }
  };

  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => {
      if (i === current) return;
      void loadRest();
      show(i);
    });
  });

  document.addEventListener("visibilitychange", () =>
    setPaused(document.hidden || !inView),
  );

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        setPaused(document.hidden || !inView);
      },
      { threshold: 0.12 },
    ).observe(hero);
  }

  intro();
  show(0, true);

  // 二枚目以降は、初回の動きが終わってから読みにいく。
  gsap.delayedCall(2, () => void loadRest());
}
