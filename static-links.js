(() => {
  const page = location.pathname.split("/").pop() || "index.html";

  const compactText = (node) => (node?.textContent || "").replace(/\s+/g, "");

  const disabledLike = (node) =>
    node.closest("[disabled], [aria-disabled='true'], .cursor-not-allowed");

  const routeFor = (target) => {
    const text = compactText(target);

    if (target.closest("#goHome")) return "./home.html";
    if ((page === "login.html" || page === "index.html") && text === "登录") return "./home.html";
    if (text.includes("AI投标系统") || text.includes("智能投标系统")) return "./home.html";
    if (text.includes("查看解析") || text.includes("重新解析")) return "./analysis.html";
    if (text.includes("生成目录")) return "./outline.html";
    if (text.includes("查看标书")) return "./generate.html";
    if (text.includes("标书核验")) return "./verification.html";
    if (text.includes("生成标书")) {
      if (page === "outline.html" || page === "analysis.html") return "./generate.html";
      return "./outline.html";
    }

    return "";
  };

  document.addEventListener(
    "submit",
    (event) => {
      if (event.target.matches("#login, .auth-form")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.location.href = "./home.html";
      }
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target.closest("a, button, #goHome, .brand, .stage-item, .flex.items-center.gap-3");
      if (!target || disabledLike(target)) return;

      const route = routeFor(target);
      if (!route) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = route;
    },
    true
  );
})();
