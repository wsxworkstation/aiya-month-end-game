(() => {
  const screen = document.getElementById("title-screen");
  if (!screen) return;

  let frame = 0;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  const paintParallax = () => {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    screen.style.setProperty("--cover-x", currentX.toFixed(3));
    screen.style.setProperty("--cover-y", currentY.toFixed(3));
    if (Math.abs(targetX - currentX) > 0.002 || Math.abs(targetY - currentY) > 0.002) {
      frame = requestAnimationFrame(paintParallax);
    } else {
      frame = 0;
    }
  };

  screen.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    const rect = screen.getBoundingClientRect();
    targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    if (!frame) frame = requestAnimationFrame(paintParallax);
  });

  screen.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
    if (!frame) frame = requestAnimationFrame(paintParallax);
  });

  screen.querySelectorAll(".title-button").forEach(button => {
    button.addEventListener("pointerdown", event => {
      const rect = button.getBoundingClientRect();
      button.style.setProperty("--press-x", `${event.clientX - rect.left}px`);
      button.style.setProperty("--press-y", `${event.clientY - rect.top}px`);
      button.classList.remove("pressed");
      requestAnimationFrame(() => button.classList.add("pressed"));
    });
    button.addEventListener("animationend", () => button.classList.remove("pressed"));
  });
})();
