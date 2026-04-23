// Scroll-reveal: adds .revealed class when elements enter viewport
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15 }
  );

  document.querySelectorAll('[data-reveal], [data-reveal-stagger]').forEach((el) => {
    observer.observe(el);
  });
} else {
  // Immediately show everything when reduced motion is preferred
  document.querySelectorAll('[data-reveal], [data-reveal-stagger]').forEach((el) => {
    el.classList.add('revealed');
  });
}
