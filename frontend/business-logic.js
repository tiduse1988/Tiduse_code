(() => {
  if (location.protocol === "file:") {
    const pageName = location.pathname.split("/").pop() || "index.html";
    const targetPage = pageName === "login.html" ? "" : pageName === "index.html" ? "" : pageName;
    location.replace(`http://localhost:8091/ai-bid/${targetPage}`);
    return;
  }

  const decodedPathname = decodeURIComponent(location.pathname);
  const page = decodedPathname.split("/").pop() || "index.html";
  const stateKey = "latoumiao-bid-state";
  const tokenKey = "latoumiao-token";
  const adminTokenKey = "latoumiao-admin-token";
  const firstSegment = decodedPathname.split("/").filter(Boolean)[0] || "";
  const projectBase = firstSegment && !firstSegment.includes(".") ? `/${firstSegment}` : "";
  const apiPath = (url) => `${projectBase}${url}`;

  const readState = () => {
    try {
      return JSON.parse(localStorage.getItem(stateKey) || "{}");
    } catch {
      return {};
    }
  };

  const writeState = (patch) => {
    const next = { ...readState(), ...patch };
    localStorage.setItem(stateKey, JSON.stringify(next));
    return next;
  };

  const token = () => localStorage.getItem(tokenKey) || localStorage.getItem(adminTokenKey) || "";
  const setToken = (value) => {
    localStorage.setItem(tokenKey, value);
    localStorage.removeItem(adminTokenKey);
  };
  const logout = () => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(adminTokenKey);
    localStorage.removeItem(stateKey);
    location.href = "./index.html";
  };
  const textOf = (node) => (node?.textContent || "").replace(/\s+/g, "");
  const displayText = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();
  const avatarText = (user) => String(user?.name || user?.account || "用").trim().slice(0, 1).toUpperCase();
  const fmtDate = (value) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }).slice(0, 17) : "-";
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  const stop = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const disabledLike = (node) =>
    node?.closest("[disabled], [aria-disabled='true'], .cursor-not-allowed, .opacity-50");

  const toast = (message, type = "success") => {
    const old = document.querySelector("[data-biz-toast]");
    if (old) old.remove();

    const node = document.createElement("div");
    node.dataset.bizToast = "true";
    node.textContent = message;
    const palette =
      type === "error"
        ? "background:#fef2f2;border-color:#fecaca;color:#b91c1c"
        : type === "warn"
          ? "background:#fffbeb;border-color:#fde68a;color:#92400e"
          : "background:#ecfdf5;border-color:#a7f3d0;color:#047857";
    node.setAttribute(
      "style",
      `position:fixed;right:24px;bottom:24px;z-index:9999;max-width:360px;padding:12px 16px;border:1px solid;border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,.14);font-size:14px;font-weight:700;line-height:1.5;${palette}`
    );
    document.body.appendChild(node);
    window.setTimeout(() => node.remove(), 2200);
  };

  const showUploadProgress = ({ fileName, percent = 0, status = "准备上传", tone = "blue" }) => {
    let node = document.querySelector("[data-upload-progress]");
    if (!node) {
      node = document.createElement("div");
      node.dataset.uploadProgress = "true";
      node.setAttribute(
        "style",
        "position:fixed;right:24px;top:84px;z-index:9998;width:360px;padding:16px;border:1px solid #dbe7ff;border-radius:16px;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.16);font-size:14px;color:#172033;"
      );
      document.body.appendChild(node);
    }
    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
    const palette = tone === "error" ? "#dc2626" : tone === "success" ? "#059669" : "#2563eb";
    node.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="width:38px;height:38px;border-radius:12px;background:#eff6ff;color:${palette};display:grid;place-items:center;flex:0 0 auto;">
          <i class="fas ${tone === "success" ? "fa-check" : tone === "error" ? "fa-triangle-exclamation" : "fa-cloud-upload-alt"}"></i>
        </div>
        <div style="min-width:0;flex:1;">
          <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:4px;">
            <strong style="font-size:15px;">${tone === "success" ? "上传成功" : tone === "error" ? "上传失败" : "项目正在上传中"}</strong>
            <span style="font-weight:800;color:${palette};">${safePercent}%</span>
          </div>
          <div title="${esc(fileName || "")}" style="color:#64748b;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(fileName || "招标文件")}</div>
          <div style="height:8px;background:#eef2f7;border-radius:999px;overflow:hidden;margin:12px 0 8px;">
            <div style="height:100%;width:${safePercent}%;background:${palette};border-radius:999px;transition:width .2s ease;"></div>
          </div>
          <div style="color:#64748b;font-size:12px;font-weight:700;">${esc(status)}</div>
        </div>
      </div>`;
    return node;
  };

  const hideUploadProgress = (delay = 1400) => {
    window.setTimeout(() => document.querySelector("[data-upload-progress]")?.remove(), delay);
  };

  const api = async (url, options = {}) => {
    const headers = {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  };

  const apiWithUploadProgress = (url, body, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      if (!(body instanceof FormData)) xhr.setRequestHeader("Content-Type", "application/json");
      if (token()) xhr.setRequestHeader("Authorization", `Bearer ${token()}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total);
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText || "{}");
        } catch {
          data = { error: xhr.responseText || "上传失败" };
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || "上传失败"));
      };
      xhr.onerror = () => reject(new Error("网络异常，上传失败；如果文件较大，请稍后重试或确认服务器上传限制"));
      xhr.ontimeout = () => reject(new Error("上传超时，请检查网络或稍后重试"));
      xhr.timeout = 15 * 60 * 1000;
      xhr.send(body);
    });

  const downloadUrl = (projectId, kind) => `${projectBase}/api/projects/${projectId}/download/${kind}?token=${encodeURIComponent(token())}`;

  const ensureLogin = () => {
    if (!token() && !["index.html", "login.html"].includes(page)) {
      location.href = "./index.html";
      return false;
    }
    return true;
  };

  const applyCurrentUser = (user) => {
    if (!user) return;
    const name = user.name || user.account || "当前用户";
    const title = user.title || (user.role === "admin" ? "后台管理员" : "标书专员");
    document.querySelectorAll("[data-current-user-name]").forEach((node) => { node.textContent = name; });
    document.querySelectorAll("[data-current-user-title]").forEach((node) => { node.textContent = title; });
    document.querySelectorAll("[data-current-user-avatar]").forEach((node) => { node.textContent = avatarText(user); });

    document.querySelectorAll("p.user-name, p.font-medium, p.text-xs, p.text-\\[10px\\]").forEach((node) => {
      const text = displayText(node);
      if (["张工", "王工", "喵小投"].includes(text)) node.textContent = name;
      if (["高级商务经理", "高级标书专员", "商务经理", "标书专员"].includes(text)) node.textContent = title;
    });
    document.querySelectorAll(".user-role").forEach((node) => { node.textContent = title; });
    document.querySelectorAll("span").forEach((node) => {
      if (displayText(node) === "张") node.textContent = avatarText(user);
    });
  };

  const bindUserMenu = () => {
    document.querySelectorAll("[data-user-menu], .user-card").forEach((target) => {
      if (target.dataset.logoutMenuBound) return;
      target.dataset.logoutMenuBound = "true";
      target.style.position = target.style.position || "relative";

      const menu = document.createElement("div");
      menu.dataset.logoutMenu = "true";
      menu.setAttribute(
        "style",
        "position:absolute;right:0;top:calc(100% + 8px);z-index:10000;width:132px;padding:6px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;box-shadow:0 14px 34px rgba(15,23,42,.16);opacity:0;transform:translateY(-4px);pointer-events:none;transition:opacity .16s ease,transform .16s ease;"
      );
      menu.innerHTML = `
        <button type="button" data-logout-action style="width:100%;height:36px;border:0;border-radius:8px;background:#fff;color:#dc2626;font-size:13px;font-weight:700;cursor:pointer;">
          退出登录
        </button>
      `;
      target.appendChild(menu);

      let hideTimer = null;
      const clearHideTimer = () => {
        if (hideTimer) window.clearTimeout(hideTimer);
        hideTimer = null;
      };
      const show = () => {
        clearHideTimer();
        menu.style.opacity = "1";
        menu.style.transform = "translateY(0)";
        menu.style.pointerEvents = "auto";
      };
      const hide = () => {
        menu.style.opacity = "0";
        menu.style.transform = "translateY(-4px)";
        menu.style.pointerEvents = "none";
      };
      const scheduleHide = () => {
        clearHideTimer();
        hideTimer = window.setTimeout(hide, 2000);
      };
      target.addEventListener("mouseenter", show);
      target.addEventListener("mouseleave", scheduleHide);
      target.addEventListener("focusin", show);
      target.addEventListener("focusout", scheduleHide);
      menu.addEventListener("mouseenter", show);
      menu.addEventListener("mouseleave", scheduleHide);
      menu.addEventListener("focusin", show);
      menu.addEventListener("focusout", scheduleHide);
      menu.querySelector("[data-logout-action]")?.addEventListener("mouseenter", (event) => {
        event.currentTarget.style.background = "#fef2f2";
      });
      menu.querySelector("[data-logout-action]")?.addEventListener("mouseleave", (event) => {
        event.currentTarget.style.background = "#fff";
      });
      menu.querySelector("[data-logout-action]")?.addEventListener("click", (event) => {
        stop(event);
        logout();
      });
    });
  };

  const hydrateCurrentUser = async () => {
    const cachedUser = readState().user;
    applyCurrentUser(cachedUser);
    bindUserMenu();
    if (!token()) return cachedUser || null;
    const data = await api(apiPath("/api/session"));
    writeState({ user: data.user });
    applyCurrentUser(data.user);
    bindUserMenu();
    return data.user;
  };

  const getActiveProjectId = async () => {
    const saved = readState().activeProjectId;
    if (saved) return saved;
    const data = await api(apiPath("/api/projects"));
    const first = data.projects?.[0];
    if (first) {
      writeState({ activeProjectId: first.id });
      return first.id;
    }
    return "";
  };

  const getActiveProject = async () => {
    const projectId = await getActiveProjectId();
    if (!projectId) return null;
    const { project } = await api(apiPath(`/api/projects/${projectId}`));
    return project;
  };

  const firstContent = (rows, labels) => {
    const list = Array.isArray(rows) ? rows : [];
    const match = list.find((row) => labels.some((label) => String(row.item || row.node || row.material || row.category || row.clause || "").includes(label)));
    return match?.content || match?.info || match?.requirement || match?.time || "";
  };

  const countRows = (...groups) => groups.reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);

  const procurementMeaningPattern = /采购|建设|工程|施工|设计|设备|硬件|软件|系统|平台|服务|运维|安装|调试|试运行|交付|验收|保修|范围|需求|内容/;
  const procurementNoisePattern = /项目解析摘要|项目摘要|综合评估|关键风险|保证金|预算|最高限价|付款|报价|评分|评标|资格条件|资格要求|废标|投标人须知/;

  const procurementRequirementRows = (raw = {}) => {
    const direct = Array.isArray(raw.procurementRequirements) ? raw.procurementRequirements : [];
    const rows = direct
      .map((row) => ({
        item: row.item || row.category || row.name || "采购需求",
        requirement: row.requirement || row.content || row.info || row.detail || "",
        responsePoint: row.responsePoint || row.note || "按招标文件采购/建设/服务范围逐项响应",
        sourcePage: row.sourcePage || row.source || ""
      }))
      .filter((row) => row.requirement && procurementMeaningPattern.test(`${row.item}${row.requirement}`) && !(procurementNoisePattern.test(`${row.item}${row.requirement}`) && !procurementMeaningPattern.test(row.requirement)));
    if (rows.length) return rows;

    return (Array.isArray(raw.technicalReview) ? raw.technicalReview : [])
      .filter((row) => procurementMeaningPattern.test(`${row.item || ""}${row.requirement || ""}`) && !procurementNoisePattern.test(`${row.item || ""}${row.requirement || ""}`))
      .slice(0, 8)
      .map((row) => ({
        item: row.item || "采购/建设/服务内容",
        requirement: row.requirement || "",
        responsePoint: row.responsePoint || "按技术/服务要求逐项响应",
        sourcePage: row.sourcePage || ""
      }));
  };

  const scoreMax = (value) => {
    const numbers = String(value ?? "").match(/\d+(?:\.\d+)?/g) || [];
    if (!numbers.length) return value ?? "";
    const max = Math.max(...numbers.map(Number));
    return Number.isInteger(max) ? String(max) : String(max).replace(/\.0+$/, "");
  };

  const bidPageRanges = [
    { value: "under_100", label: "100页以内", target: 12, description: "技术目录保持精简，但正文完整可用。" },
    { value: "100_300", label: "100-300页", target: 38, description: "按中等厚标扩写技术目录和正文内容。" },
    { value: "300_600", label: "400-600页", target: 72, description: "深度扩写技术目录和正文，目标生成400页以上。" },
    { value: "over_600", label: "600页以上", target: 96, description: "充分扩写技术目录，面向大型、厚标响应文件。" }
  ];

  const normalizeBidPageRange = (value = "") => {
    const text = String(value || "").trim();
    if (["400_600", "400-600", "300-600", "300_600"].includes(text)) return "300_600";
    if (text === "100-300") return "100_300";
    if (text === "600+" || text === "over600") return "over_600";
    if (text === "100以内" || text === "under100") return "under_100";
    return bidPageRanges.some((item) => item.value === text) ? text : "under_100";
  };

  const bidPageRangeMeta = (value) => bidPageRanges.find((item) => item.value === normalizeBidPageRange(value)) || bidPageRanges[0];

  const selectedBidPageRange = (project) => {
    if (project?.bidPageRange) return normalizeBidPageRange(project.bidPageRange);
    const cachedRange = readState().bidPageRangeByProject?.[project?.id];
    return normalizeBidPageRange(cachedRange || "100_300");
  };

  const hasBidTechnicalChapters = (project) =>
    Boolean(project?.bidGenerated) ||
    (Array.isArray(project?.bidDocument?.technicalChapters) && project.bidDocument.technicalChapters.length > 0);

  const hasOutlineDocument = (project) => {
    const outline = project?.outlineDocument || {};
    return Boolean(project?.outlineGenerated) ||
      Boolean(outline.businessPart?.length || outline.technicalPart?.length || outline.attachmentsPart?.length);
  };

  const bidGenerationRequest = (project) =>
    JSON.stringify({ bidPageRange: selectedBidPageRange(project) });

  const cleanScoringCriteria = (value) =>
    String(value ?? "")
      .replace(/\r/g, "")
      .replace(/\n+/g, "")
      .replace(/(\d)\s+(\d)(分钟|分|%|月|日|年|元)/g, "$1$2$3")
      .trim();

  const fieldLabel = (key) =>
    ({
      item: "项目",
      content: "内容",
      remark: "备注",
      node: "事项节点",
      time: "具体时间",
      reminder: "备注 / 提示",
      info: "具体信息",
      note: "说明",
      requirement: "具体要求",
      evidence: "证明材料",
      judgement: "符合性判断",
      name: "名称",
      required: "是否必需",
      issuer: "发证机关",
      validity: "有效期要求",
      sealed: "盖章要求",
      source: "来源",
      responsePoint: "响应要点",
      riskLevel: "风险等级",
      scoreRelated: "评分关联",
      category: "评分项",
      score: "分值",
      criteria: "评分细则",
      responseStrategy: "响应策略",
      clause: "条款",
      risk: "风险",
      action: "处理建议",
      material: "资料名称",
      step: "评审步骤",
      sourcePage: "来源页码"
    }[key] || key);

  const table = (headers, rows, keys, options = {}) => {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return '<div class="card"><p>招标文件中未明确，建议人工复核原文。</p></div>';
    const excluded = new Set(options.excludeKeys || []);
    const extraKeys = Array.from(new Set(list.flatMap((row) => Object.keys(row || {}))))
      .filter((key) => !keys.includes(key) && !excluded.has(key) && list.some((row) => row?.[key] !== undefined && row?.[key] !== ""));
    const finalKeys = [...keys, ...extraKeys];
    const finalHeaders = [...headers, ...extraKeys.map(fieldLabel)];
    const scoreKeys = new Set(options.scoreMaxKeys || []);
    return `
      <div class="card table-card">
        <div class="table-scroll">
          <table>
            <thead><tr>${finalHeaders.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead>
            <tbody>
              ${list
                .map(
                  (row, index) => `<tr${index === 0 && /截止|废标|无效|保证金/.test(Object.values(row).join("")) ? ' class="critical-row"' : ""}>
                    ${finalKeys
                      .map((key, keyIndex) => {
                        const value = scoreKeys.has(key) ? scoreMax(row[key]) : row[key];
                        const style = key === "criteria" || key === "requirement" || key === "risk" ? ' style="white-space:pre-wrap"' : "";
                        return `<td${style}>${keyIndex === 0 ? `<strong>${esc(value || "")}</strong>` : esc(value || "")}</td>`;
                      })
                      .join("")}
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  };

  const bullets = (items) => {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return '<div class="card"><p>招标文件中未明确，建议人工复核原文。</p></div>';
    return `<div class="card"><ul class="inline-list">${list.map((item) => `<li><span class="dot"></span>${esc(item)}</li>`).join("")}</ul></div>`;
  };

  const stripLeadingNumber = (value) =>
    String(value ?? "")
      .replace(/^\s*(?:[一二三四五六七八九十]+[、.．]|[0-9]+(?:\.[0-9]+)*[、.．]?)\s*/, "")
      .trim();

  const cleanOutlineChild = (value) =>
    stripLeadingNumber(value)
      .replace(/^(?:含|包括|包含|如|例如|需提供|提供)\s*/, "")
      .replace(/[.．。…]+$/g, "")
      .replace(/等(?:资料|材料|文件|证明)?$/g, "")
      .trim();

  const shouldSplitOutlineItem = (base, hint, parts) => {
    const rawHint = String(hint || "").trim();
    if (!parts.length || /^(?:如适用|适用时提供|服务类|货物类|工程类|采购人要求|按招标文件要求)$/.test(rawHint)) return false;

    const joined = `${base} ${rawHint}`;
    const materialContext = /资料|材料|文件|证书|证明|证照|附件|清单|资质|资格|审查|授权|声明|报价|报表|许可|业绩|合同|营业执照|财务|审计|纳税|社保|能力|复印件|扫描件|函|表/.test(joined);
    const materialLike = /营业执照|审计|纳税|社保|证明|证书|许可证|经营许可|合同|授权书|声明函|承诺函|报价表|明细表|偏离表|一览表|复印件|扫描件|截图|报告|资料|材料|文件|业绩|保函|保证金|资质|证照|身份证/.test(parts.join(" "));
    const responseContext = /方案|承诺函|证明材料|响应|要求|服务|技术|商务|质量|管理|流程|责任|知识产权|安全|创新|控制|团队|人员|体系|著作权|认证/.test(joined);
    const responseTopicLike = /质量|控制|信息|准确|技术|创新|服务|流程|文档|管理|单位负责人|负责人|知识产权|安全责任|软件著作权|体系认证|责任|人员|团队|制度|承诺|应急|保密|廉洁|项目管理|组织架构|评价|验收|售后|培训/.test(parts.join(" "));
    const guidanceOnly = /逐条响应|响应第[一二三四五六七八九十\d]+章|响应采购需求|评分标准|服务内容|服务时间|服务地点|付款方式/.test(rawHint);

    if (guidanceOnly && !materialLike && !responseTopicLike) return false;
    return parts.length >= 2 && ((materialContext && materialLike) || (responseContext && responseTopicLike));
  };

  const outlineItemModel = (item) => {
    const original = stripLeadingNumber(item);
    const match = original.match(/^(.*?)[（(]([^（）()]+)[）)]\s*$/);
    if (!match) return { label: original, children: [] };

    const base = match[1].trim().replace(/[：:、，,；;]\s*$/g, "");
    const hint = match[2].trim();
    const parts = hint
      .replace(/^(?:含|包括|包含|如|例如|需提供|提供)\s*/, "")
      .split(/[、，,；;]/)
      .map(cleanOutlineChild)
      .filter((part) => part.length > 1);

    if (!base || !shouldSplitOutlineItem(base, hint, parts)) return { label: original, children: [] };
    return { label: base, children: parts };
  };

  const countOutlineItems = (groups) =>
    groups.reduce((total, group) => total + 1 + group.items.reduce((sum, item) => sum + 1 + outlineItemModel(item).children.length, 0), 0);

  const nestedDirectoryHtml = (items, emptyText = "待补充目录") => {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return `<ol class="list-decimal pl-6 space-y-1"><li>${esc(emptyText)}</li></ol>`;
    return `<ol class="list-decimal pl-6 space-y-1">${list
      .map((item) => {
        const model = outlineItemModel(item);
        return `<li>${esc(model.label)}${model.children.length ? `<ol class="list-[lower-alpha] pl-5 mt-1 space-y-1">${model.children.map((child) => `<li>${esc(child)}</li>`).join("")}</ol>` : ""}</li>`;
      })
      .join("")}</ol>`;
  };

  const compactOutlineLabel = (value) =>
    stripLeadingNumber(value)
      .replace(/[（(][^（）()]+[）)]\s*$/g, "")
      .replace(/^(?:技术部分|技术响应|技术方案)[：:、，,；;]?\s*/, "")
      .trim();

  const pushUniqueOutline = (items, value) => {
    const label = compactOutlineLabel(value);
    if (!label) return;
    const normalized = label.replace(/\s+/g, "");
    if (items.some((item) => compactOutlineLabel(item).replace(/\s+/g, "") === normalized)) return;
    items.push(label);
  };

  const expandTechnicalOutline = (raw, technicalItems, rangeValue) => {
    const range = bidPageRangeMeta(rangeValue);
    const base = (Array.isArray(technicalItems) ? technicalItems : []).filter(Boolean);
    if (range.value === "under_100") return base;

    const expanded = [...base];
    const scoringText = JSON.stringify(raw?.scoringReview || []);
    const technicalText = JSON.stringify(raw?.technicalReview || []);
    const allText = `${scoringText}\n${technicalText}`;

    const scoringNames = (raw?.scoringReview || [])
      .map((item) => item.category || item.item || "")
      .filter((item) => /技术|方案|服务|质量|人员|团队|项目|实施|培训|运维|售后|响应|安全|保密|进度|业绩|能力/.test(item));
    scoringNames.forEach((item) => pushUniqueOutline(expanded, `${compactOutlineLabel(item)}专项响应`));

    const pools = [
      ["项目理解与需求分析", "技术响应总体说明", "采购需求逐条响应表", "评分项逐项响应索引"],
      ["总体实施方案", "项目组织架构与职责分工", "项目进度计划与里程碑", "质量控制与成果校核方案"],
      ["人员配置方案", "团队专业能力说明", "沟通协调机制", "文档管理与资料归档方案"],
      ["重点难点分析及解决措施", "风险识别与控制方案", "应急响应保障方案", "验收交付方案"],
      ["数据安全与保密管理", "培训计划", "售后服务与持续支持", "创新优化措施"]
    ];

    pools.flat().forEach((item) => {
      if (expanded.length < range.target) pushUniqueOutline(expanded, item);
    });

    if (/遥感|影像|图斑|测绘|无人机|卫星|GIS|地理信息/.test(allText)) {
      ["遥感监测技术路线", "影像解译与图斑核查方案", "无人机巡检作业方案", "数据成果质量检查方案"].forEach((item) => {
        if (expanded.length < range.target) pushUniqueOutline(expanded, item);
      });
    }
    if (/运维|维护|巡检|故障|服务台|响应/.test(allText)) {
      ["运维服务方案", "巡检维护计划", "故障响应与闭环处理", "服务台管理方案"].forEach((item) => {
        if (expanded.length < range.target) pushUniqueOutline(expanded, item);
      });
    }
    if (/接听|话务|热线|坐席|满意度|回访/.test(allText)) {
      ["话务服务组织方案", "接听质量控制方案", "坐席人员管理方案", "服务绩效提升方案"].forEach((item) => {
        if (expanded.length < range.target) pushUniqueOutline(expanded, item);
      });
    }

    let index = 1;
    while (expanded.length < range.target) {
      pushUniqueOutline(expanded, `技术专项扩展章节${index}`);
      index += 1;
    }
    return expanded;
  };

  const richTextHtml = (value) => {
    const lines = String(value || "").split(/\r?\n/);
    const parts = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) continue;
      if (line.startsWith("|") && line.endsWith("|")) {
        const tableLines = [];
        while (index < lines.length && lines[index].trim().startsWith("|") && lines[index].trim().endsWith("|")) {
          tableLines.push(lines[index].trim());
          index += 1;
        }
        index -= 1;
        const rows = tableLines
          .filter((item) => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(item))
          .map((item) => item.split("|").slice(1, -1).map((cell) => cell.trim()));
        if (rows.length) {
          const [head, ...body] = rows;
          parts.push(`<div class="overflow-x-auto"><table class="w-full border-collapse text-xs my-3"><thead><tr>${head.map((cell) => `<th class="border border-surface-300 bg-surface-100 px-2 py-1 text-left">${esc(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td class="border border-surface-300 px-2 py-1 align-top">${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
        }
      } else {
        parts.push(`<p>${esc(line)}</p>`);
      }
    }
    return parts.join("");
  };

  const normalizedSearchText = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, "");

  const issueTerms = (issue = {}) =>
    [issue.item, issue.category, issue.problem, issue.tenderRequirement, issue.location]
      .flatMap((value) => String(value || "").split(/[，,。、；;：:\s（）()]+/))
      .map((value) => normalizedSearchText(value))
      .filter((value) => value.length >= 3 && !["必须修复", "建议确认", "附件部分目录", "商务部分目录", "技术部分正文"].includes(value));

  const bidSectionKey = (title = "", index = 0) => {
    const value = String(title || "");
    if (value.includes("商务")) return "business";
    if (value.includes("技术")) return "technical";
    if (value.includes("附件")) return "attachment";
    return `part-${index + 1}`;
  };

  const bidSectionMajorNo = (section, index = 0) => {
    if (section === "business") return 1;
    if (section === "technical") return 2;
    if (section === "attachment") return 3;
    return index + 1;
  };

  const bidAnchorId = (section, ...numbers) => `bid-${section}${numbers.length ? `-${numbers.join("-")}` : ""}`;

  const bidDirectoryHtml = (items, emptyText, section) => {
    const list = Array.isArray(items) ? items : [];
    const majorNo = bidSectionMajorNo(section);
    if (!list.length) {
      return `<div class="space-y-1 pl-3"><p id="${esc(bidAnchorId(section, 1))}" data-bid-target data-bid-section="${esc(section)}" class="scroll-mt-24 rounded transition-colors">${esc(`${majorNo}.1`)} ${esc(emptyText)}</p></div>`;
    }
    return `<div class="space-y-1 pl-3">${list
      .map((item, index) => {
        const model = outlineItemModel(item);
        const itemNo = `${majorNo}.${index + 1}`;
        return `<div>
          <p id="${esc(bidAnchorId(section, index + 1))}" data-bid-target data-bid-section="${esc(section)}" data-bid-label="${esc(model.label)}" class="scroll-mt-24 rounded transition-colors">${esc(itemNo)} ${esc(model.label)}</p>
          ${model.children.length ? `<div class="pl-5 mt-1 space-y-1">${model.children.map((child, childIndex) => `<p id="${esc(bidAnchorId(section, index + 1, childIndex + 1))}" data-bid-target data-bid-section="${esc(section)}" data-bid-label="${esc(child)}" class="scroll-mt-24 rounded transition-colors">${esc(`${itemNo}.${childIndex + 1}`)} ${esc(child)}</p>`).join("")}</div>` : ""}
        </div>`;
      })
      .join("")}</div>`;
  };

  const bidDocumentPreviewHtml = (project, meta, bidDocument) => {
    const doc = bidDocument || {};
    const technical = doc.technicalChapters || [];
    return `
      <h1 class="text-3xl font-bold text-center text-black mb-10 tracking-widest">投 标 文 件</h1>
      <div class="space-y-5 text-sm text-surface-800 leading-relaxed text-justify">
        <p><strong>项目名称：</strong>${esc(meta.projectName)}</p>
        <p><strong>项目编号：</strong>${esc(meta.projectNo || "未明确")}</p>
        <section id="${esc(bidAnchorId("business"))}" data-bid-target data-bid-section="business" class="space-y-3 scroll-mt-24 rounded-lg transition-colors">
          <h2 class="text-xl font-bold text-black pt-4">一、商务部分目录</h2>
          <p class="text-surface-500">商务、资质、证照、业绩等资料需由投标人按实际情况提供，系统仅保留目录，不编造内容。</p>
          ${bidDirectoryHtml(doc.businessDirectory || [], "待补充商务目录", "business")}
        </section>
        <section id="${esc(bidAnchorId("technical"))}" data-bid-target data-bid-section="technical" class="space-y-4 scroll-mt-24 rounded-lg transition-colors">
          <h2 class="text-xl font-bold text-black pt-4">二、技术部分</h2>
          ${technical.length
            ? technical
                .map(
                  (chapter, index) => {
                    const sections = Array.isArray(chapter.sections) ? chapter.sections.filter((section) => section?.heading || section?.content) : [];
                    return `<section id="${esc(bidAnchorId("technical", index + 1))}" data-bid-target data-bid-section="technical" data-bid-label="${esc(chapter.title || "技术章节")}" data-bid-chapter-index="${index}" class="space-y-3 scroll-mt-24 rounded-lg px-2 py-1 transition-colors">
                      <h3 class="text-lg font-bold text-black">2.${index + 1} ${esc(chapter.title || "技术章节")}</h3>
                      ${sections.length
                        ? sections
                            .map(
                              (section, sectionIndex) => `<section id="${esc(bidAnchorId("technical", index + 1, sectionIndex + 1))}" data-bid-target data-bid-section="technical" data-bid-label="${esc(section.heading || "")}" class="space-y-2 scroll-mt-24 rounded-lg py-1 transition-colors">
                                <h4 class="text-base font-bold text-black">2.${index + 1}.${sectionIndex + 1} ${esc(section.heading || "章节内容")}</h4>
                                ${richTextHtml(section.content)}
                              </section>`
                            )
                            .join("")
                        : richTextHtml(chapter.content)}
                    </section>`;
                  }
                )
                .join("")
            : "<p>技术正文尚未生成，请先生成投标文件。</p>"}
        </section>
        <section id="${esc(bidAnchorId("attachment"))}" data-bid-target data-bid-section="attachment" class="space-y-3 scroll-mt-24 rounded-lg transition-colors">
          <h2 class="text-xl font-bold text-black pt-4">三、附件部分目录</h2>
          <p class="text-surface-500">证照、审计报告、纳税社保、承诺函、业绩、人员证书等附件需由投标人提供真实材料。</p>
          ${bidDirectoryHtml(doc.attachmentDirectory || [], "待补充附件目录", "attachment")}
        </section>
      </div>`;
  };

  const BID_PREVIEW_PAGE_CHAR_LIMIT = 1350;

  const stripHtmlForCount = (value = "") =>
    String(value || "")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, "")
      .replace(/\s+/g, "");

  const previewCanvas = () => document.querySelector("[data-document-preview]") || document.querySelector(".doc-page")?.parentElement;

  const bidPreviewBlock = (html, options = {}) => ({
    html,
    size: Math.max(80, stripHtmlForCount(html).length + Number(options.extraSize || 0)),
    forceBreakBefore: Boolean(options.forceBreakBefore)
  });

  const bidDocumentPreviewBlocks = (project, meta, bidDocument) => {
    const doc = bidDocument || {};
    const technical = Array.isArray(doc.technicalChapters) ? doc.technicalChapters : [];
    const blocks = [
      bidPreviewBlock(`
        <h1 class="text-3xl font-bold text-center text-black mb-10 tracking-widest">投 标 文 件</h1>
        <div class="space-y-5 text-sm text-surface-800 leading-relaxed">
          <p><strong>项目名称：</strong>${esc(meta.projectName)}</p>
          <p><strong>项目编号：</strong>${esc(meta.projectNo || "未明确")}</p>
        </div>
      `, { extraSize: 260 }),
      bidPreviewBlock(`
        <section id="${esc(bidAnchorId("business"))}" data-bid-target data-bid-section="business" class="space-y-3 scroll-mt-24 rounded-lg transition-colors">
          <h2 class="text-xl font-bold text-black pt-4">一、商务部分目录</h2>
          <p class="text-surface-500">商务、资质、证照、业绩等资料需由投标人按实际情况提供，系统仅保留目录，不编造内容。</p>
          ${bidDirectoryHtml(doc.businessDirectory || [], "待补充商务目录", "business")}
        </section>
      `, { extraSize: 320 }),
      bidPreviewBlock(`
        <section id="${esc(bidAnchorId("technical"))}" data-bid-target data-bid-section="technical" class="space-y-4 scroll-mt-24 rounded-lg transition-colors">
          <h2 class="text-xl font-bold text-black pt-4">二、技术部分</h2>
        </section>
      `, { forceBreakBefore: true })
    ];

    if (technical.length) {
      technical.forEach((chapter, chapterIndex) => {
        const sections = Array.isArray(chapter.sections) ? chapter.sections.filter((section) => section?.heading || section?.content) : [];
        if (!sections.length) {
          blocks.push(
            bidPreviewBlock(
              `<section id="${esc(bidAnchorId("technical", chapterIndex + 1))}" data-bid-target data-bid-section="technical" data-bid-label="${esc(chapter.title || "技术章节")}" class="space-y-3 scroll-mt-24 rounded-lg px-2 py-1 transition-colors">
                <h3 class="text-lg font-bold text-black">2.${chapterIndex + 1} ${esc(chapter.title || "技术章节")}</h3>
                ${richTextHtml(chapter.content)}
              </section>`,
              { extraSize: 160 }
            )
          );
          return;
        }

        blocks.push(
          bidPreviewBlock(
            `<section id="${esc(bidAnchorId("technical", chapterIndex + 1))}" data-bid-target data-bid-section="technical" data-bid-label="${esc(chapter.title || "技术章节")}" class="space-y-3 scroll-mt-24 rounded-lg px-2 py-1 transition-colors">
              <h3 class="text-lg font-bold text-black">2.${chapterIndex + 1} ${esc(chapter.title || "技术章节")}</h3>
            </section>`,
            { extraSize: 120 }
          )
        );

        sections.forEach((section, sectionIndex) => {
          blocks.push(
            bidPreviewBlock(
              `<section id="${esc(bidAnchorId("technical", chapterIndex + 1, sectionIndex + 1))}" data-bid-target data-bid-section="technical" data-bid-label="${esc(section.heading || "")}" class="space-y-2 scroll-mt-24 rounded-lg py-1 transition-colors">
                <h4 class="text-base font-bold text-black">2.${chapterIndex + 1}.${sectionIndex + 1} ${esc(section.heading || "章节内容")}</h4>
                ${richTextHtml(section.content)}
              </section>`,
              { extraSize: 140 }
            )
          );
        });
      });
    } else {
      blocks.push(bidPreviewBlock("<p>技术正文尚未生成，请先生成投标文件。</p>"));
    }

    blocks.push(
      bidPreviewBlock(
        `<section id="${esc(bidAnchorId("attachment"))}" data-bid-target data-bid-section="attachment" class="space-y-3 scroll-mt-24 rounded-lg transition-colors">
          <h2 class="text-xl font-bold text-black pt-4">三、附件部分目录</h2>
          <p class="text-surface-500">证照、审计报告、纳税社保、承诺函、业绩、人员证书等附件需由投标人提供真实材料。</p>
          ${bidDirectoryHtml(doc.attachmentDirectory || [], "待补充附件目录", "attachment")}
        </section>`,
        { forceBreakBefore: true, extraSize: 260 }
      )
    );

    return blocks;
  };

  const paginateBidBlocks = (blocks) => {
    const pages = [];
    let current = [];
    let currentSize = 0;
    blocks.forEach((block) => {
      const shouldBreak = current.length && (block.forceBreakBefore || currentSize + block.size > BID_PREVIEW_PAGE_CHAR_LIMIT);
      if (shouldBreak) {
        pages.push(current);
        current = [];
        currentSize = 0;
      }
      current.push(block.html);
      currentSize += block.size;
    });
    if (current.length) pages.push(current);
    return pages.length ? pages : [["<p>暂无投标文件内容。</p>"]];
  };

  const bidDocumentPreviewPages = (project, meta, bidDocument) => paginateBidBlocks(bidDocumentPreviewBlocks(project, meta, bidDocument));

  const bidPreviewPagesHtml = (pages) => {
    const list = Array.isArray(pages) && pages.length ? pages : [["<p>暂无投标文件内容。</p>"]];
    return `<div class="doc-pages flex flex-col items-center gap-8">${list
      .map(
        (page, index) => `
          <article class="doc-page bg-white text-sm text-surface-800 leading-relaxed text-justify">
            <div class="space-y-5">${page.join("")}</div>
            <div class="doc-page-footer">第 ${index + 1} / ${list.length} 页</div>
          </article>`
      )
      .join("")}</div>`;
  };

  const bidDocumentPagedPreviewHtml = (project, meta, bidDocument) => bidPreviewPagesHtml(bidDocumentPreviewPages(project, meta, bidDocument));

  const uploadedBidPagedPreviewHtml = (uploadedBid) => {
    const previewPages = Array.isArray(uploadedBid?.previewPages) ? uploadedBid.previewPages : [];
    const pages = previewPages.length
      ? previewPages.map((page) => {
          const paragraphs = String(page.text || "")
            .split(/\n{1,}/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 120);
          return paragraphs.length
            ? paragraphs.map((line) => `<p>${esc(line)}</p>`)
            : [`<p>${esc(String(page.text || "暂无投标文件内容。"))}</p>`];
        })
      : [[`<p>已上传标书，但暂未提取到可预览正文。请确认文件不是加密文件，或点击“开始核验”查看提取结果。</p>`]];
    return bidPreviewPagesHtml(pages);
  };

  const formatScoreValue = (value) => {
    if (value === 0) return "0";
    if (value === null || value === undefined || value === "") return "-";
    return String(value);
  };

  const scoreEstimateHtml = (verification = {}) => {
    const estimate = verification.scoreEstimate || {};
    const items = Array.isArray(estimate.items) ? estimate.items : [];
    const summaryCards = [
      ["总分", estimate.totalFullScore, estimate.totalEstimatedScore],
      ["商务分", estimate.businessFullScore, estimate.businessEstimatedScore],
      ["技术分", estimate.technicalFullScore, estimate.technicalEstimatedScore]
    ];
    return `
      <div class="h-full bg-white p-8 overflow-auto">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h3 class="text-xl font-black text-surface-900">得分推算</h3>
            <p class="mt-1 text-sm text-surface-500">根据评分表和当前投标文件推断商务分、技术分及扣分风险。</p>
          </div>
          <span class="text-xs font-bold text-primary bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">DeepSeek 推算</span>
        </div>
        <div class="grid grid-cols-3 gap-3 mb-5">
          ${summaryCards.map(([label, full, estimated]) => `
            <div class="rounded-xl border border-surface-200 bg-surface-50 p-4">
              <p class="text-xs font-bold text-surface-500">${esc(label)}</p>
              <p class="mt-2 text-2xl font-black text-surface-900">${esc(formatScoreValue(estimated))}<span class="mx-1 text-sm text-surface-400">/</span><span class="text-base text-surface-600">${esc(formatScoreValue(full))}</span></p>
              <p class="mt-1 text-xs text-surface-400">预计得分 / 满分</p>
            </div>`).join("")}
        </div>
        <div class="rounded-xl border border-surface-200 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-surface-50 text-surface-500">
              <tr><th class="px-4 py-3">类别</th><th class="px-4 py-3">评分项</th><th class="px-4 py-3">满分</th><th class="px-4 py-3">预计得分</th><th class="px-4 py-3">依据/风险</th></tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${items.length ? items.map((item) => `
                <tr>
                  <td class="px-4 py-3 font-bold text-surface-700">${esc(item.category || "-")}</td>
                  <td class="px-4 py-3 text-surface-800">${esc(item.scoringItem || item.item || "-")}</td>
                  <td class="px-4 py-3 font-bold text-surface-700">${esc(formatScoreValue(item.fullScore))}</td>
                  <td class="px-4 py-3 font-black text-primary">${esc(formatScoreValue(item.estimatedScore))}</td>
                  <td class="px-4 py-3 text-surface-600 leading-relaxed">${esc(item.basis || item.risk || "待人工确认")}</td>
                </tr>`).join("") : `<tr><td colspan="5" class="px-4 py-12 text-center text-surface-500">核验完成后展示得分推算。</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  };

  const estimateBidPageCount = (bidDocument) => {
    const stats = bidStatsRaw(bidDocument);
    return stats.textLength ? Math.max(1, Math.ceil((stats.textLength + 900) / BID_PREVIEW_PAGE_CHAR_LIMIT)) : 0;
  };

  const preferredIssueSection = (issue = {}) => {
    const text = `${issue.location || ""}${issue.category || ""}${issue.item || ""}${issue.problem || ""}`;
    if (/技术|方案|实施|响应内容|正文|参数/.test(text)) return "technical";
    if (/附件|资格|材料|营业执照|财务|纳税|社保|承诺函|声明函|保证金|证书|业绩|人员/.test(text)) return "attachment";
    if (/商务|报价|投标函|开标|报价明细|目录/.test(text)) return "business";
    return "";
  };

  const findBidIssueTarget = (issue = {}) => {
    const section = preferredIssueSection(issue);
    const terms = issueTerms(issue);
    const allTargets = Array.from(document.querySelectorAll("[data-bid-target]"));
    const sectionTargets = section ? allTargets.filter((node) => node.dataset.bidSection === section) : allTargets;
    const findMatch = (targets) =>
      targets.find((node) => {
        const content = normalizedSearchText(`${node.dataset.bidLabel || ""} ${node.textContent || ""}`);
        return terms.some((term) => content.includes(term) || term.includes(content));
      });
    return findMatch(sectionTargets) || sectionTargets[0] || findMatch(allTargets) || allTargets[0] || null;
  };

  const sectionTitle = (title) => `
    <div class="section-title">
      <h2>${esc(title)}</h2>
      <span class="line" aria-hidden="true"></span>
    </div>`;

  const setSectionHtml = (id, title, body) => {
    const section = document.getElementById(id);
    if (!section) return;
    section.innerHTML = `${sectionTitle(title)}${body}`;
  };

  const renderAnalysisPending = (project) => {
    document.body.classList.remove("analysis-booting");
    document.title = `${project?.name || "招标文件"} - 招标文件解析中`;
    const nextButton = document.querySelector("[data-purpose='analysis-next-action']");
    if (nextButton) nextButton.hidden = true;
    const message = project?.message || "AI正在解析招标文件，请稍候。";
    const progress = Math.max(0, Math.min(100, Number(project?.progress || 0)));
    setSectionHtml(
      "section-info",
      "项目基本信息",
      `<div class="card" style="grid-column:1/-1">
        <h3>${esc(project?.name || "招标文件")}</h3>
        <p style="margin-top:10px;color:#64748b">${esc(message)}</p>
        <div style="height:10px;background:#eef2f7;border-radius:999px;overflow:hidden;margin-top:18px;">
          <div style="height:100%;width:${progress}%;background:#2563eb;border-radius:999px;transition:width .25s ease;"></div>
        </div>
      </div>`
    );
    [
      ["section-timeline", "重要时间节点"],
      ["section-eligibility", "资格条件"],
      ["section-business", "商务要求"],
      ["section-technical", "技术要求"],
      ["section-scoring", "评分标准"],
      ["section-termination", "废标条款"],
      ["section-requirements", "采购需求"],
      ["section-submission", "投标文件要求"]
    ].forEach(([id, title]) => {
      setSectionHtml(id, title, `<div class="notice"><span class="icon-box"><svg class="icon" viewBox="0 0 24 24"><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="m4.93 4.93 2.83 2.83"></path><path d="m16.24 16.24 2.83 2.83"></path><path d="M2 12h4"></path><path d="M18 12h4"></path></svg></span><div><strong>正在生成该标段解析结果</strong><span>${esc(message)}</span></div></div>`);
    });
    const bottomStatus = document.querySelector(".bottom-bar .status");
    if (bottomStatus) {
      bottomStatus.innerHTML = `<span>${esc(message)}</span><span class="divider" aria-hidden="true"></span><span><strong>${progress}%</strong></span>`;
    }
    window.clearTimeout(window.__analysisPollTimer);
    if (project?.status !== "completed" && project?.status !== "failed") {
      window.__analysisPollTimer = window.setTimeout(() => renderAnalysisPage().catch((error) => toast(error.message, "error")), 3000);
    }
  };

  const projectMeta = (project) => {
    const raw = project?.result?.raw || {};
    const basic = raw.basicReview || {};
    const projectBasicInfo = basic.projectBasicInfo || [];
    const budgetPricing = basic.budgetPricing || [];
    const keyDates = basic.keyDates || [];
    const rawProjectName = firstContent(projectBasicInfo, ["项目名称"]);
    return {
      raw,
      basic,
      projectName: project?.selectedLot ? project?.name || rawProjectName || "未命名项目" : rawProjectName || project?.name || "未命名项目",
      projectNo: firstContent(projectBasicInfo, ["项目编号", "招标编号", "采购编号"]) || "",
      tenderee: firstContent(projectBasicInfo, ["采购人", "招标人"]) || "",
      agency: firstContent(projectBasicInfo, ["代理机构"]) || "",
      budget: firstContent(budgetPricing, ["预算", "采购预算"]) || firstContent(budgetPricing, ["最高限价"]) || "未明确",
      duration: firstContent(budgetPricing, ["服务期", "工期", "交付期"]) || firstContent(projectBasicInfo, ["服务期", "工期"]) || "未明确",
      deadline: firstContent(keyDates, ["投标截止", "磋商截止", "响应截止", "开标时间"]) || ""
    };
  };

  const renderAnalysisNextAction = (project) => {
    const button = document.querySelector("[data-purpose='analysis-next-action']");
    if (!button) return;
    if (!project || project.status !== "completed") {
      button.hidden = true;
      return;
    }
    const hasOutline = hasOutlineDocument(project);
    const hasBid = hasBidTechnicalChapters(project);
    const label = !hasOutline ? "生成目录" : hasBid ? "查看标书" : "生成标书";
    button.hidden = false;
    button.dataset.nextTarget = !hasOutline ? "outline" : "generate";
    button.textContent = label;
  };

  const updateProjectInfoBlocks = (project, meta) => {
    const projectNameLabels = Array.from(document.querySelectorAll("p")).filter((node) => textOf(node) === "项目名称");
    projectNameLabels.forEach((label) => {
      const value = label.nextElementSibling;
      if (value) value.textContent = meta.projectName;
      const card = label.closest(".bg-surface-50");
      if (card && meta.projectNo && !card.querySelector("[data-project-no]")) {
        label.parentElement?.insertAdjacentHTML(
          "afterend",
          `<div data-project-no><p class="text-[10px] text-surface-400 mb-1">项目编号</p><p class="text-xs font-bold text-surface-800 leading-relaxed">${esc(meta.projectNo)}</p></div>`
        );
      }
    });
    document.title = `${meta.projectName} - ${document.title.replace(/^.* - /, "")}`;
    Array.from(document.querySelectorAll("p, span, h1, h2, h3, div")).forEach((node) => {
      if (node.childElementCount) return;
      const text = node.textContent || "";
      if (text.includes("XX市政府采购信息化建设项目") || text.includes("2024年城市轨道交通信号系统升级改造工程")) {
        node.textContent = text
          .replaceAll("XX市政府采购信息化建设项目", meta.projectName)
          .replaceAll("2024年城市轨道交通信号系统升级改造工程", meta.projectName);
      }
      if (text.includes("招标文件.pdf") && project?.fileName) node.textContent = text.replaceAll("招标文件.pdf", project.fileName);
      if (text.includes("28.3 MB") && project?.fileSizeText) node.textContent = text.replaceAll("28.3 MB", project.fileSizeText);
      if (text.includes("CT-2024-0614") && meta.projectNo) node.textContent = text.replaceAll("CT-2024-0614", meta.projectNo);
    });
  };

  const outlineGroups = (raw, project = null) => {
    const outline = raw?.bidOutline || {};
    const bidDocument = project?.bidDocument || {};
    const outlineDocument = project?.outlineDocument || {};
    const selectedRange = selectedBidPageRange(project);
    const fallback = [
      "一、磋商函",
      "二、法人授权书",
      "三、报价文件",
      "四、商务响应",
      "五、技术响应",
      "六、附件资料"
    ];
    if (outlineDocument.businessPart?.length || outlineDocument.technicalPart?.length || outlineDocument.attachmentsPart?.length) {
      return [
        { title: "商务部分", items: outlineDocument.businessPart || outline.businessPart || fallback.slice(0, 4) },
        { title: "技术部分", items: outlineDocument.technicalPart || outline.technicalPart || fallback.slice(4, 5) },
        { title: "附件部分", items: outlineDocument.attachmentsPart || outline.attachmentsPart || fallback.slice(5) }
      ].filter((group) => group.items?.length);
    }
    if (bidDocument.businessDirectory?.length || bidDocument.technicalChapters?.length || bidDocument.attachmentDirectory?.length) {
      return [
        { title: "商务部分", items: bidDocument.businessDirectory || outline.businessPart || fallback.slice(0, 4) },
        { title: "技术部分", items: bidDocument.technicalChapters?.length ? bidDocument.technicalChapters.map((chapter) => chapter.title).filter(Boolean) : outline.technicalPart || fallback.slice(4, 5) },
        { title: "附件部分", items: bidDocument.attachmentDirectory || outline.attachmentsPart || fallback.slice(5) }
      ].filter((group) => group.items?.length);
    }
    return [
      { title: "商务部分", items: outline.businessPart || fallback.slice(0, 4) },
      { title: "技术部分", items: expandTechnicalOutline(raw, outline.technicalPart || fallback.slice(4, 5), selectedRange) },
      { title: "附件部分", items: outline.attachmentsPart || fallback.slice(5) }
    ].filter((group) => group.items?.length);
  };

  const deriveExactScoringRows = (project) => {
    const tables = project?.extraction?.tables || [];
    const rows = [];
    const normalize = (value) => String(value ?? "").replace(/\r/g, "").trim();
    const headerIndex = (header, keyword) => header.findIndex((cell) => normalize(cell).includes(keyword));
    let last = null;
    for (const tableData of tables) {
      const body = tableData.rows || [];
      const headerRowIndex = body.findIndex((row) => row.some((cell) => normalize(cell).includes("评审标准")) && row.some((cell) => normalize(cell).includes("分值")));
      if (headerRowIndex < 0) continue;
      const header = body[headerRowIndex];
      const stepIndex = headerIndex(header, "评标步骤");
      const factorIndex = headerIndex(header, "评审因素");
      const criteriaIndex = headerIndex(header, "评审标准");
      const scoreIndex = headerIndex(header, "分值");
      if (criteriaIndex < 0 || scoreIndex < 0) continue;
      for (const row of body.slice(headerRowIndex + 1)) {
        const factor = normalize(row[factorIndex]);
        const criteria = cleanScoringCriteria(row[criteriaIndex]);
        const score = normalize(row[scoreIndex]);
        const step = normalize(row[stepIndex]);
        if (!criteria || /\/\s*73|共\d+页|项目编号/.test(criteria)) continue;
        if (score && /\d/.test(score) && criteria.length > 12) {
          last = {
            step: step || last?.step || "",
            category: factor || step || "评分项",
            score: scoreMax(score),
            criteria,
            responseStrategy: "按评分细则逐项准备证明材料和响应章节",
            sourcePage: tableData.page ? `第${tableData.page}页` : ""
          };
          rows.push(last);
        } else if (!score && last && criteria.length > 20) {
          last.criteria = `${last.criteria}\n${criteria}`;
        }
      }
    }
    const seen = new Set();
    return rows.filter((row) => {
      const key = `${row.category}-${row.score}-${row.criteria.slice(0, 24)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const mergeScoringRows = (primary = [], secondary = []) => {
    const result = [];
    const seen = new Set();
    [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])].forEach((row) => {
      if (!row) return;
      const category = String(row.category || row.item || row.name || row.step || "评分项").trim();
      const score = scoreMax(row.score || row.scoreOriginal || row.points || row.value || "");
      const criteria = String(row.criteria || row.requirement || row.detail || row.content || row.description || "").trim();
      if (!category && !criteria) return;
      const key = `${category.replace(/\s+/g, "")}|${score}|${criteria.replace(/\s+/g, "").slice(0, 80)}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ ...row, category, score, criteria });
    });
    return result;
  };

  const outlineTreeHtml = (groups, interactive = true) =>
    groups
      .map((group, groupIndex) => {
        const actionHtml = interactive
          ? `<div class="item-actions flex items-center gap-2">
              <button class="px-3 py-1 flex items-center justify-center gap-1.5 rounded bg-white border border-surface-200 text-primary text-xs hover:border-primary transition-colors"><i class="fas fa-pen text-[10px]"></i> 编辑</button>
              <button class="px-3 py-1 flex items-center justify-center gap-1.5 rounded bg-white border border-surface-200 text-green-600 text-xs hover:border-green-600 transition-colors"><i class="fas fa-plus text-[10px]"></i> 子项</button>
              <button class="px-3 py-1 flex items-center justify-center gap-1.5 rounded bg-white border border-surface-200 text-red-500 text-xs hover:bg-red-50 hover:border-red-200 transition-colors"><i class="fas fa-trash-alt text-[10px]"></i> 删除</button>
            </div>`
          : "";
        return `
          <div class="tree-item ${groupIndex === 0 ? "active" : ""} rounded-lg cursor-pointer hover:bg-surface-50 border border-transparent hover:border-surface-200 group/item transition-colors p-2">
            <div class="flex items-center gap-3">
              <div class="cursor-grab text-surface-300 hover:text-surface-500"><i class="fas fa-grip-vertical text-xs"></i></div>
              <div class="flex-1 flex items-center justify-between min-w-0">
                <div class="flex items-center gap-3 min-w-0">
                  <span class="text-xs font-bold ${groupIndex === 0 ? "text-primary bg-primary/10" : "text-surface-500 bg-surface-100"} px-2 py-0.5 rounded shrink-0">第${groupIndex + 1}章</span>
                  <span class="text-base ${groupIndex === 0 ? "font-bold text-surface-800" : "font-medium text-surface-700"} truncate">${esc(group.title)}</span>
                </div>
                ${actionHtml}
              </div>
            </div>
          </div>
          ${group.items
            .map((item, itemIndex) => {
              const model = outlineItemModel(item);
              return `
              <div class="tree-item rounded-lg ml-10 cursor-pointer hover:bg-surface-50 border border-transparent hover:border-surface-200 group/item transition-colors p-2">
                <div class="flex items-center gap-3">
                  <div class="cursor-grab text-surface-300 pt-1.5"><i class="fas fa-grip-vertical text-xs"></i></div>
                  <div class="flex-1 flex items-center justify-between min-w-0">
                    <div class="flex items-center gap-3 min-w-0">
                      <span class="text-xs text-surface-400 shrink-0 font-medium">${groupIndex + 1}.${itemIndex + 1}</span>
                      <span class="text-sm text-surface-600 truncate">${esc(model.label)}</span>
                    </div>
                    ${actionHtml}
                  </div>
                </div>
              </div>
              ${model.children
                .map(
                  (child, childIndex) => `
                  <div class="tree-item rounded-lg ml-20 cursor-pointer hover:bg-surface-50 border border-transparent hover:border-surface-200 group/item transition-colors p-2">
                    <div class="flex items-center gap-3">
                      <div class="cursor-grab text-surface-300 pt-1.5"><i class="fas fa-grip-vertical text-[10px]"></i></div>
                      <div class="flex-1 flex items-center justify-between min-w-0">
                        <div class="flex items-center gap-3 min-w-0">
                          <span class="text-xs text-surface-400 shrink-0 font-medium">${groupIndex + 1}.${itemIndex + 1}.${childIndex + 1}</span>
                          <span class="text-sm text-surface-600 truncate">${esc(child)}</span>
                        </div>
                        ${actionHtml}
                      </div>
                    </div>
                  </div>`
                )
                .join("")}`;
            })
            .join("")}`;
      })
      .join("");

  const bidStatsRaw = (bidDocument) => {
    const doc = bidDocument || {};
    const business = doc.businessDirectory || [];
    const attachments = doc.attachmentDirectory || [];
    const technical = doc.technicalChapters || [];
    const technicalText = technical
      .map((chapter) => {
        const sections = Array.isArray(chapter.sections) ? chapter.sections : [];
        return `${chapter.title || ""}\n${chapter.content || ""}\n${sections.map((section) => `${section.heading || ""}\n${section.content || ""}`).join("\n")}`;
      })
      .join("\n");
    const directoryText = [...business, ...attachments].join("\n");
    const textLength = `${directoryText}\n${technicalText}`.replace(/\s+/g, "").length;
    const chapterCount = business.length + attachments.length + technical.length + technical.reduce((sum, chapter) => sum + (Array.isArray(chapter.sections) ? chapter.sections.length : 0), 0);
    return { chapterCount, textLength };
  };

  const bidStats = (bidDocument) => {
    const raw = bidStatsRaw(bidDocument);
    return {
      ...raw,
      pageCount: raw.textLength ? Math.max(1, Math.ceil((raw.textLength + 900) / BID_PREVIEW_PAGE_CHAR_LIMIT)) : 0
    };
  };

  const renderBidGenerationStatus = (project, bidDocument, options = {}) => {
    const statusBox = document.querySelector("[data-purpose='generation-status']");
    if (!statusBox) return;
    const generating = options.generating || project?.bidStatus === "generating";
    const generated = Boolean(bidDocument?.technicalChapters?.length || project?.bidDocument?.technicalChapters?.length);
    const failed = project?.bidStatus === "failed";
    const stats = bidStats(bidDocument || project?.bidDocument || {});
    const displayPageCount = options.pageCount || stats.pageCount;
    const realProgress = Math.max(0, Math.min(100, Number(project?.bidProgress || 0)));
    const state = generating
      ? {
          card: "bg-blue-50/70 border-blue-100",
          iconBg: "bg-blue-500",
          icon: "fa-wand-magic-sparkles",
          label: "DeepSeek 正在生成标书内容",
          progress: realProgress ? `${realProgress}%` : "处理中",
          progressText: project?.bidMessage || "正在按技术目录分章生成",
          barTrack: "bg-white",
          barFill: "bg-blue-500",
          barStyle: `width:${realProgress || 8}%`,
          running: true,
          statusText: "生成中",
          statusClass: "bg-blue-100 text-blue-700"
        }
      : failed
        ? {
            card: "bg-red-50/70 border-red-100",
            iconBg: "bg-red-500",
            icon: "fa-triangle-exclamation",
            label: "标书生成失败",
            progress: "需重试",
          progressText: "请点击重新生成标书",
          barTrack: "bg-white",
          barFill: "bg-red-500 w-1/4",
          barStyle: "",
          statusText: "生成失败",
          statusClass: "bg-red-100 text-red-700"
          }
        : generated
          ? {
              card: "bg-green-50/70 border-green-100",
              iconBg: "bg-green-500",
              icon: "fa-check",
              label: "标书内容生成已完成",
              progress: "已完成",
              progressText: "可下载标书",
              barTrack: "bg-white",
              barFill: "bg-green-500 w-full",
              barStyle: "",
              statusText: "生成完成",
              statusClass: "bg-green-100 text-green-700"
            }
          : {
              card: "bg-surface-50 border-surface-100",
              iconBg: "bg-surface-300",
              icon: "fa-clock",
              label: "标书内容待生成",
              progress: "未开始",
              progressText: "等待生成",
              barTrack: "bg-white",
              barFill: "bg-surface-300 w-0",
              barStyle: "",
              statusText: "未生成",
              statusClass: "bg-surface-100 text-surface-600"
            };

    statusBox.className = `${state.card} rounded-xl p-4 border space-y-4`;
    statusBox.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-full ${state.iconBg} text-white flex items-center justify-center shrink-0">
          <i class="fas ${state.icon} text-sm"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1.5 gap-3">
            <span class="text-xs font-bold text-surface-800">${esc(state.label)}</span>
            <span class="text-xs font-medium ${generated ? "text-green-700" : generating ? "text-blue-700" : failed ? "text-red-700" : "text-surface-500"}">${esc(state.progress)}</span>
          </div>
          <div class="w-full ${state.barTrack} h-2 rounded-full overflow-hidden generation-bar ${state.running ? "is-running" : ""}">
            <div class="${state.barFill} h-full" style="${state.barStyle || ""}"></div>
          </div>
          <p class="mt-2 text-[10px] text-surface-400">${esc(state.progressText)}</p>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3 pt-3 border-t ${generated ? "border-green-100" : generating ? "border-blue-100" : failed ? "border-red-100" : "border-surface-100"}">
        <div>
          <p class="text-[10px] text-surface-400 mb-1">章节数</p>
          <p class="text-sm font-bold text-surface-800">${generated ? esc(stats.chapterCount || "-") : "-"}</p>
        </div>
        <div>
          <p class="text-[10px] text-surface-400 mb-1">文件页数</p>
          <p class="text-sm font-bold text-surface-800">${generated ? `${esc(displayPageCount || "-")} 页` : "-"}</p>
        </div>
      </div>`;

    const statusLabel = Array.from(document.querySelectorAll("p")).find((node) => textOf(node) === "文档状态")?.nextElementSibling;
    if (statusLabel) {
      statusLabel.textContent = state.statusText;
      statusLabel.className = `text-[10px] ${state.statusClass} px-1.5 py-0.5 rounded font-medium`;
    }

    setButtonDisabled(document.querySelector("[data-purpose='download-bid']"), !generated || generating);
    setButtonDisabled(document.querySelector("[data-purpose='regenerate-outline']"), generating);
    setButtonDisabled(document.querySelector("[data-purpose='regenerate-bid']"), generating);
  };

  const renderGenerateNavigation = (groups) => {
    const navContent = document.querySelector("aside nav .space-y-3");
    if (!navContent) return;
    navContent.innerHTML = groups?.length
      ? groups
          .map(
            (group, index) => {
              const section = bidSectionKey(group.title, index);
              const majorNo = bidSectionMajorNo(section, index);
              return `
            <div>
              <button type="button" data-scroll-target="${esc(bidAnchorId(section))}" class="w-full flex items-center gap-2 text-left ${index === 0 ? "text-primary font-bold" : "font-medium text-surface-800"} hover:text-primary">
                <i class="fas fa-caret-down text-surface-400 w-3"></i>
                <span class="text-xs rounded bg-surface-100 px-1.5 py-0.5 text-surface-500">${esc(majorNo)}</span>
                <span class="truncate">${esc(group.title)}</span>
              </button>
              <div class="mt-3 ml-6 space-y-3 text-surface-700">
                ${group.items
                  .map((item, itemIndex) => {
                    const model = outlineItemModel(item);
                    const itemNo = `${majorNo}.${itemIndex + 1}`;
                    return `<div>
                      <button type="button" data-scroll-target="${esc(bidAnchorId(section, itemIndex + 1))}" class="w-full flex items-center gap-2 text-left hover:text-primary">
                        ${model.children.length ? `<i class="fas fa-caret-right text-surface-400 w-3"></i>` : `<span class="w-3 shrink-0"></span>`}
                        <span class="w-10 shrink-0 text-surface-400">${esc(itemNo)}</span>
                        <span class="truncate">${esc(model.label)}</span>
                      </button>
                      ${model.children.length ? `<div class="mt-2 ml-8 space-y-2 text-xs text-surface-500">${model.children.map((child, childIndex) => `<button type="button" data-scroll-target="${esc(bidAnchorId(section, itemIndex + 1, childIndex + 1))}" class="w-full flex items-center gap-2 text-left hover:text-primary"><span class="w-12 shrink-0 text-surface-400">${esc(`${itemNo}.${childIndex + 1}`)}</span><span class="truncate">${esc(child)}</span></button>`).join("")}</div>` : ""}
                    </div>`;
                  })
                  .join("")}
              </div>
            </div>`;
            }
          )
          .join("")
      : `<div class="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
          正在读取上一步生成的目录...
        </div>`;
  };

  const renderGenerateWaiting = (message, subMessage = "生成完成后将自动展示投标文件正文。") => {
    const canvas = previewCanvas();
    if (!canvas) return;
    canvas.innerHTML = `
      <div class="doc-page bg-white">
        <div class="min-h-[940px] flex flex-col items-center justify-center text-center">
          <div class="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20 mb-5">
            <i class="fas fa-wand-magic-sparkles text-2xl"></i>
          </div>
          <h1 class="text-2xl font-bold text-surface-900 mb-3">投标文件正在生成中</h1>
          <p class="max-w-xl text-sm leading-7 text-surface-500">${esc(message)}</p>
          <p class="mt-2 max-w-xl text-sm leading-7 text-surface-400">${esc(subMessage)}</p>
          <div class="mt-8 w-72 h-2 rounded-full bg-surface-100 overflow-hidden generation-bar is-running"></div>
        </div>
        <div class="doc-page-footer">第 1 / 1 页</div>
      </div>`;
  };

  const outlineScoringRows = (project) => {
    if (!project) return [];
    const meta = projectMeta(project);
    const exactRows = deriveExactScoringRows(project);
    const rawRows = Array.isArray(meta.raw?.scoringReview) ? meta.raw.scoringReview : [];
    const rows = mergeScoringRows(exactRows, rawRows);
    const normalized = rows
      .map((row) => ({
        category: row.category || row.item || row.name || row.step || "评分项",
        score: scoreMax(row.score || row.scoreOriginal || row.points || row.value || ""),
        criteria: row.criteria || row.requirement || row.detail || row.content || row.description || ""
      }))
      .filter((row) => row.category || row.score || row.criteria);
    const seen = new Set();
    return normalized.filter((row) => {
      const key = `${row.category}-${row.score}-${String(row.criteria).slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const renderOutlineScoringPanel = (project) => {
    const body = document.querySelector("[data-purpose='outline-scoring-body']");
    const count = document.querySelector("[data-purpose='outline-scoring-count']");
    if (!body) return;
    const rows = outlineScoringRows(project);
    if (count) count.textContent = rows.length ? `${rows.length} 项` : "待提取";
    if (!rows.length) {
      body.innerHTML = `
        <div class="m-5 rounded-xl border border-amber-100 bg-amber-50 p-5 text-sm leading-6 text-amber-700">
          暂未读取到结构化评分表。请先确认招标文件解析已完成，或在解析报告“评分标准”中复核原文。
        </div>`;
      return;
    }
    body.innerHTML = `
      <table class="outline-scoring-table">
        <thead>
          <tr>
            <th style="width:150px">评分项</th>
            <th style="width:64px;text-align:center">分值</th>
            <th>评分细则</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const scoreText = row.score || "-";
              const scoreNumber = Number(String(scoreText).match(/\d+(?:\.\d+)?/)?.[0] || 0);
              return `<tr class="${scoreNumber >= 10 ? "is-important" : ""}">
                <td class="score-item">${esc(row.category || "评分项")}</td>
                <td class="score-value">${esc(scoreText)}</td>
                <td class="score-criteria">${esc(row.criteria || "评分细则未明确，建议人工核对原文。")}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;
  };

  const renderOutlinePage = async () => {
    let project = await getActiveProject();
    if (!project) return;
    renderOutlineScoringPanel(project);
    const selectedRange = project.bidPageRange ? normalizeBidPageRange(project.bidPageRange) : "";
    const state = readState();
    const forceDeepSeekOutline = state.forceRegenerateOutlineProjectId === project.id;
    if (forceDeepSeekOutline) writeState({ forceRegenerateOutlineProjectId: "" });
    const tree = document.querySelector("[data-purpose='directory-tree-list']");
    const chapterBadge = Array.from(document.querySelectorAll("span")).find((node) => textOf(node).includes("Chapters") || textOf(node).includes("Items"));
    if (project.status === "completed" && !selectedRange) {
      if (tree) {
        tree.innerHTML = `
          <div class="rounded-2xl border border-amber-100 bg-amber-50 p-6 text-center">
            <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white">
              <i class="fas fa-circle-exclamation"></i>
            </div>
            <p class="text-base font-bold text-surface-900">请先选择投标文件内容量</p>
            <p class="mt-2 text-sm text-surface-500">请在弹框中选择页数档位，确认后系统会立即重新生成目录。</p>
          </div>`;
      }
      if (chapterBadge) chapterBadge.textContent = "未选择";
      toast("请先在首页选择投标文件内容量", "warn");
      window.setTimeout(() => {
        openBidPageRangeModal(project.id, {
          project,
          redirect: false,
          afterSave: () => renderOutlinePage().catch((error) => toast(error.message, "error"))
        });
      }, 80);
      return;
    }
    const needsDeepSeekOutline =
      project.status === "completed" &&
      (forceDeepSeekOutline || !project.outlineDocument || project.outlineDocument.bidPageRange !== selectedRange);
    if (needsDeepSeekOutline) {
      if (tree) {
        tree.innerHTML = `
          <div class="rounded-2xl border border-blue-100 bg-blue-50 p-6 text-center">
            <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white">
              <i class="fas fa-wand-magic-sparkles"></i>
            </div>
            <p class="text-base font-bold text-surface-900">DeepSeek 正在生成投标文件目录</p>
            <p class="mt-2 text-sm text-surface-500">已按“${esc(bidPageRangeMeta(selectedRange).label)}”读取招标文件、评分表和响应文件格式，请稍候。</p>
          </div>`;
      }
      if (chapterBadge) chapterBadge.textContent = "AI 生成中";
      toast("正在调用 DeepSeek 生成目录，请稍候", "warn");
      const data = await api(apiPath(`/api/projects/${project.id}/generate-outline`), { method: "POST", body: "{}" });
      project = data.project;
      renderOutlineScoringPanel(project);
    }
    const meta = projectMeta(project);
    const groups = outlineGroups(meta.raw, project);
    updateProjectInfoBlocks(project, meta);

    if (tree) tree.innerHTML = outlineTreeHtml(groups, true);
    if (chapterBadge) chapterBadge.textContent = `${countOutlineItems(groups)} Items`;
  };

  const renderGeneratePage = async () => {
    renderGenerateWaiting("正在读取项目、目录和所选标书页数档位。");
    renderBidGenerationStatus({ bidStatus: "generating" }, {}, { generating: true });
    let project = await getActiveProject();
    if (!project) return;

    const selectedRange = project.outlineDocument?.bidPageRange || project.bidPageRange || selectedBidPageRange(project);
    let meta = projectMeta(project);
    let groups = outlineGroups(meta.raw, project);
    renderGenerateNavigation(groups);
    updateProjectInfoBlocks(project, meta);

    const hasConfirmedOutline = Array.isArray(project.outlineDocument?.technicalPart) && project.outlineDocument.technicalPart.length > 0;
    if (!hasConfirmedOutline) {
      renderBidGenerationStatus(project, {}, { generating: false });
      renderGenerateWaiting("当前项目还没有已确认的投标文件目录。请先回到生成目录页，按所选页数档位生成并确认目录后，再进入本页生成标书内容。", "生成标书页只负责按已确认目录撰写正文，不会修改目录结构。");
      return;
    }

    const needsGeneration =
      project.status === "completed" &&
      (!hasBidTechnicalChapters(project) || project.bidDocument?.bidPageRange !== selectedRange);

    if (project.bidStatus === "generating" && !hasBidTechnicalChapters(project)) {
      renderBidGenerationStatus(project, {}, { generating: true });
      renderGenerateWaiting("DeepSeek 正在根据上一步目录撰写技术部分正文。商务资质、证照、业绩等材料不会编造，只保留目录等待投标人补充。");
      window.setTimeout(() => renderGeneratePage().catch(() => {}), 3000);
      return;
    }

    if (needsGeneration) {
      renderBidGenerationStatus(project, {}, { generating: true });
      renderGenerateWaiting("正在调用 DeepSeek 生成技术部分正文。商务资质、证照、业绩等材料不会编造，只保留目录等待投标人补充。");
      toast("正在调用 DeepSeek 生成技术部分，请稍候", "warn");
      const data = await api(apiPath(`/api/projects/${project.id}/generate-bid`), { method: "POST", body: bidGenerationRequest(project) });
      project = data.project;
      meta = projectMeta(project);
      groups = outlineGroups(meta.raw, project);
      if (project.bidStatus === "generating" && !hasBidTechnicalChapters(project)) {
        renderBidGenerationStatus(project, {}, { generating: true });
        renderGenerateWaiting("DeepSeek 正在按目录分章撰写标书内容，生成完成后会自动展示正文。");
        window.setTimeout(() => renderGeneratePage().catch(() => {}), 3000);
        return;
      }
    }
    const bidDocument = project.bidDocument || {};
    const technicalOutlineItems = (bidDocument.technicalChapters || []).map((chapter) => {
      const sections = Array.isArray(chapter.sections) ? chapter.sections.map((section) => section.heading).filter(Boolean) : [];
      return sections.length ? `${chapter.title || "技术章节"}（${sections.join("、")}）` : chapter.title;
    }).filter(Boolean);
    const bidGroups = [
      { title: "商务部分", items: bidDocument.businessDirectory || groups.find((group) => group.title === "商务部分")?.items || [] },
      { title: "技术部分", items: technicalOutlineItems.length ? technicalOutlineItems : groups.find((group) => group.title === "技术部分")?.items || [] },
      { title: "附件部分", items: bidDocument.attachmentDirectory || groups.find((group) => group.title === "附件部分")?.items || [] }
    ].filter((group) => group.items?.length);
    updateProjectInfoBlocks(project, meta);
    const previewPages = bidDocumentPreviewPages(project, meta, bidDocument);
    renderBidGenerationStatus(project, bidDocument, { pageCount: previewPages.length });

    renderGenerateNavigation(bidGroups);

    const canvas = previewCanvas();
    if (canvas) canvas.innerHTML = bidPreviewPagesHtml(previewPages);
  };

  const verificationSeverityView = (severity = "") => {
    if (String(severity).includes("必须") || String(severity).includes("高风险")) {
      return { label: "必须修复", text: "text-red-600", bg: "bg-red-50", border: "border-red-300", icon: "fa-triangle-exclamation" };
    }
    if (String(severity).includes("建议") || String(severity).includes("确认") || String(severity).includes("待补")) {
      return { label: "建议确认", text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-300", icon: "fa-circle-exclamation" };
    }
    return { label: "提示", text: "text-blue-600", bg: "bg-blue-50", border: "border-blue-300", icon: "fa-circle-info" };
  };

  const renderVerificationLoading = (message) => {
    const docPage = document.querySelector(".doc-page");
    if (docPage) {
      docPage.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-center">
          <div class="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center mb-4">
            <i class="fas fa-shield-alt"></i>
          </div>
          <h2 class="text-xl font-bold text-surface-900">DeepSeek 正在核验标书</h2>
          <p class="mt-3 text-sm text-surface-500 leading-relaxed">${esc(message || "正在对照招标文件和投标文件生成核验报告，请稍候。")}</p>
        </div>`;
    }
  };

  const renderVerificationPage = async () => {
    let project = await getActiveProject();
    if (!project) return;
    const meta = projectMeta(project);
    const ruleCount = countRows(
      meta.raw.qualificationCompliance?.qualificationReview,
      meta.raw.qualificationCompliance?.certificateChecklist,
      meta.raw.businessReview,
      meta.raw.technicalReview,
      meta.raw.scoringReview,
      meta.raw.rejectionClauses,
      meta.raw.submissionFormat,
      meta.raw.materialsChecklist
    );
    updateProjectInfoBlocks(project, meta);

    if (!project.uploadedBid && project.bidDocument?.technicalChapters?.length && !project.verificationDocument && project.verificationStatus !== "failed") {
      renderVerificationLoading("正在读取招标文件解析结果、原招标文件正文和已生成投标文件。");
      toast("正在调用 DeepSeek 核验标书，请稍候", "warn");
      const data = await api(apiPath(`/api/projects/${project.id}/verify`), { method: "POST", body: "{}" });
      project = data.project;
    }

    const verification = project.verificationDocument || {};
    const isVerified = project.verificationStatus === "verified" && Boolean(project.verificationDocument);
    const issues = isVerified && Array.isArray(verification.issues) ? verification.issues : [];
    const missing = isVerified && Array.isArray(verification.missingMaterials) ? verification.missingMaterials : [];
    const dimensions = isVerified && Array.isArray(verification.dimensions) ? verification.dimensions : [];
    const mustFix = isVerified ? issues.filter((item) => /必须|高风险/.test(item.severity || "")).length : 0;
    const warning = isVerified ? issues.filter((item) => !/必须|高风险/.test(item.severity || "")).length : 0;
    const checked = isVerified ? Number(verification.checkedItems ?? issues.length) : 0;
    const passed = isVerified ? Number(verification.passedCount ?? Math.max(0, checked - mustFix - warning)) : 0;

    const title = document.querySelector("aside h1");
    if (title) title.textContent = meta.projectName;
    const subtitle = title?.nextElementSibling;
    if (subtitle) subtitle.innerHTML = `<span>招标编号：${esc(meta.projectNo || "-")}</span><span class="w-1 h-1 rounded-full bg-surface-300"></span><span>截止：${esc(meta.deadline || "未明确")}</span>`;
    const rules = Array.from(document.querySelectorAll("p")).find((node) => textOf(node).includes("已抽取"));
    if (rules) rules.textContent = `已抽取 ${ruleCount} 条核验规则`;
    const totalRules = Array.from(document.querySelectorAll("span")).find((node) => textOf(node) === "核验规则总数")?.previousElementSibling;
    if (totalRules) totalRules.textContent = isVerified ? String(checked) : "--";

    const bidFile = document.querySelector("#bidFile");
    if (bidFile) {
      const uploadedBid = project.uploadedBid;
      const bidFileName = uploadedBid?.fileName || "投标文件.docx";
      const uploadVerified = uploadedBid?.status === "verified" || verification.verifiedAt;
      const bidFileStatus = uploadedBid
        ? `${uploadedBid.pageCount || 0} 页，已上传，${uploadVerified ? "已核验" : "待核验"}`
        : `${project.bidDocument?.technicalChapters?.length || 0} 个技术章节，${verification.verifiedAt ? "已核验" : "待核验"}`;
      bidFile.innerHTML = `
        <i class="far fa-file-word text-primary text-xl"></i>
        <div>
          <p class="text-sm font-bold text-surface-800">${esc(bidFileName)}</p>
          <p class="text-xs text-surface-500">${esc(bidFileStatus)}</p>
        </div>`;
    }

    const scoreNode = document.querySelector("#score");
    if (scoreNode) scoreNode.textContent = isVerified ? (verification.score ?? "--") : "--";
    const metricGrid = document.querySelector(".grid.grid-cols-5");
    if (metricGrid) {
      metricGrid.innerHTML = `
        <div class="bg-white rounded-xl border border-surface-200 p-5"><strong id="score" class="block text-3xl text-primary font-bold">${esc(isVerified ? (verification.score ?? "--") : "--")}</strong><span class="text-xs text-surface-500">综合通过分</span></div>
        <div class="bg-white rounded-xl border border-surface-200 p-5"><strong class="block text-3xl text-red-600 font-bold">${esc(mustFix)}</strong><span class="text-xs text-surface-500">必须修复</span></div>
        <div class="bg-white rounded-xl border border-surface-200 p-5"><strong class="block text-3xl text-amber-600 font-bold">${esc(warning)}</strong><span class="text-xs text-surface-500">建议确认</span></div>
        <div class="bg-white rounded-xl border border-surface-200 p-5"><strong class="block text-3xl text-green-600 font-bold">${esc(isVerified ? passed : 0)}</strong><span class="text-xs text-surface-500">已通过规则</span></div>
        <div class="bg-white rounded-xl border border-surface-200 p-5"><strong class="block text-3xl text-surface-900 font-bold">${esc(isVerified ? checked : "--")}</strong><span class="text-xs text-surface-500">核验规则总数</span></div>`;
    }

    const downloadVerifyButton = document.querySelector("#locateFirst");
    if (downloadVerifyButton) {
      downloadVerifyButton.innerHTML = `<i class="fas fa-file-word mr-1"></i>下载核验文件`;
    }

    const previewTitle = document.querySelector("[data-verification-preview] .text-sm.font-bold");
    if (previewTitle) {
      previewTitle.innerHTML = `得分推算 <span class="text-surface-300 mx-1">•</span> 满分与预计得分`;
    }

    const previewShell = document.querySelector("[data-verification-preview]");
    const docPage = previewShell?.querySelector(".doc-page");
    if (docPage) {
      docPage.outerHTML = `<div class="doc-page bg-white text-sm text-surface-800 leading-relaxed">${scoreEstimateHtml(isVerified ? verification : {})}</div>`;
    }


    document.querySelectorAll("button").forEach((button) => {
      const label = textOf(button);
      if (label.includes("定位原文") || label.includes("标记已处理")) {
        button.classList.add("hidden");
        button.style.display = "none";
      }
    });

        const dimensionBox = Array.from(document.querySelectorAll("section h3")).find((node) => textOf(node) === "核验维度")?.closest("section")?.querySelector(".p-5.space-y-3");
    if (dimensionBox) {
      dimensionBox.innerHTML = dimensions.length ? dimensions.slice(0, 6).map((item) => {
        const view = verificationSeverityView(item.status);
        return `
          <div class="grid grid-cols-[36px_1fr_auto] items-center gap-3 p-3 rounded-xl border border-surface-200">
            <span class="w-9 h-9 rounded-lg ${view.bg} ${view.text} flex items-center justify-center"><i class="fas ${view.icon}"></i></span>
            <div><p class="text-sm font-bold text-surface-800">${esc(item.name || "核验维度")}</p><p class="text-xs text-surface-500">${esc(item.detail || "DeepSeek 已完成该维度核验")}</p></div>
            <span class="text-xs font-bold ${view.text} ${view.bg} px-2.5 py-1 rounded-full">${esc(item.status || view.label)}</span>
          </div>`;
      }).join("") : `<div class="rounded-xl border border-surface-200 bg-surface-50 p-5 text-center text-sm text-surface-500">投标文件完成核验后显示各维度结果。</div>`;
    }

    const issueList = document.querySelector("aside.w-\\[380px\\] .flex-1");
    if (issueList) {
      const cards = issues.length ? issues : [{ severity: "提示", problem: isVerified ? "DeepSeek 未发现明确高风险问题" : "投标文件尚未核验", suggestion: isVerified ? "请人工复核报价、签章和最终上传附件。" : "请点击“开始核验”，系统将根据招标文件、投标文件和核验规则生成结果。", location: "-" }];
      const filterBar = issueList.previousElementSibling?.querySelector(".flex.gap-2");
      if (filterBar) {
        filterBar.innerHTML = `
          <span class="text-xs font-bold text-primary bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">全部 ${esc(issues.length)}</span>
          <span class="text-xs font-bold text-surface-600 bg-white border border-surface-200 px-3 py-1.5 rounded-full">必须修复 ${esc(mustFix)}</span>
          <span class="text-xs font-bold text-surface-600 bg-white border border-surface-200 px-3 py-1.5 rounded-full">建议确认 ${esc(warning)}</span>`;
      }
      const state = readState();
      const selectedIndex = Number(state.selectedVerificationIssueByProject?.[project.id] || 0);
      issueList.innerHTML = cards.map((issue, index) => {
        const view = verificationSeverityView(issue.severity);
        const selected = index === selectedIndex;
        return `
          <button data-verification-issue-card="${index}" class="w-full text-left rounded-xl border ${selected ? "border-blue-300 bg-blue-50/30 shadow-sm" : "border-surface-200 bg-white"} p-4">
            <div class="flex justify-between mb-2"><span class="text-xs font-bold ${view.text} ${view.bg} px-2 py-1 rounded-full"><i class="fas ${view.icon} mr-1"></i>${esc(issue.severity || view.label)}</span><span class="text-xs text-surface-500">${esc(issue.location || "章节")}</span></div>
            <p class="text-sm font-bold text-surface-900 mb-2">${esc(issue.problem || issue.item || "核验提示")}</p>
            <p class="text-xs text-surface-500">${esc(issue.suggestion || issue.tenderRequirement || "请人工复核。")}</p>
          </button>`;
      }).join("");
    }
  };

  const renderAnalysisPage = async () => {
    const project = await getActiveProject();
    if (!project) return;
    document.body.classList.remove("analysis-booting");
    if (project.lotSelectionRequired) {
      writeState({ activeProjectId: project.id, pendingLotProjectId: project.id });
      toast("该项目包含多个标段，请先选择本次解析标段", "warn");
      window.location.href = "./home.html";
      return;
    }
    if (project.status !== "completed") {
      renderAnalysisPending(project);
      return;
    }
    window.clearTimeout(window.__analysisPollTimer);
    const meta = projectMeta(project);
    const raw = meta.raw;
    const basic = meta.basic;
    const quality = project.result?.extractionQuality || raw.extractionQuality || {};
    const projectBasicInfo = basic.projectBasicInfo || [];
    const budgetPricing = basic.budgetPricing || [];
    const guaranteeInfo = basic.guaranteeInfo || [];
    const qualification = raw.qualificationCompliance || {};
    const scoringReview = mergeScoringRows(deriveExactScoringRows(project), raw.scoringReview);

    document.title = `${meta.projectName} - 招标文件解析结果`;
    renderAnalysisNextAction(project);

    document.querySelector(".overview")?.remove();

    setSectionHtml(
      "section-info",
      "项目基本信息",
      `
      <div class="grid grid-3">
        ${(projectBasicInfo.length ? projectBasicInfo : [{ item: "项目名称", content: meta.projectName }, { item: "上传文件", content: project.fileName }])
          .map(
            (row) => `<div class="card">
              <span class="field-label">${esc(row.item || "项目要素")}</span>
              <span class="${/预算|金额|限价/.test(row.item || "") ? "money" : "field-value"}">${esc(row.content || row.info || row.requirement || "未明确")}</span>
              ${row.remark ? `<p>${esc(row.remark)}</p>` : ""}
            </div>`
          )
          .join("")}
      </div>`
    );

    setSectionHtml("section-timeline", "重要时间节点", table(["事项节点", "具体时间", "备注 / 提示", "原文页码"], basic.keyDates, ["node", "time", "reminder", "sourcePage"]));

    setSectionHtml(
      "section-eligibility",
      "资格条件",
      `
      ${table(["审查项目", "具体要求", "证明材料", "符合性判断"], qualification.qualificationReview, ["item", "requirement", "evidence", "judgement"])}
      <div style="margin-top:14px">${table(["证照名称", "是否必需", "发证机关", "有效期要求", "盖章要求", "来源"], qualification.certificateChecklist, ["name", "required", "issuer", "validity", "sealed", "source"])}</div>`
    );

    setSectionHtml("section-business", "商务要求", table(["要求项", "具体要求", "响应要点", "风险等级"], raw.businessReview, ["item", "requirement", "responsePoint", "riskLevel"]));

    setSectionHtml("section-technical", "技术要求", table(["要求项", "具体要求", "响应要点", "评分关联"], raw.technicalReview, ["item", "requirement", "responsePoint", "scoreRelated"]));

    setSectionHtml(
      "section-scoring",
      "评分标准",
      `
      ${table(["评分项", "分值", "评分细则", "响应策略", "原文页码"], scoringReview, ["category", "score", "criteria", "responseStrategy", "sourcePage"], { scoreMaxKeys: ["score"], excludeKeys: ["scoreOriginal"] })}
      <div class="notice ${raw.scoringCompleteness?.status === "可能不完整" ? "warning" : "info"}" style="margin-top:14px"><strong>评分表完整性：</strong>${esc(raw.scoringCompleteness?.status || "未明确")}；已提取最高分合计 ${esc(raw.scoringCompleteness?.extractedTotal ?? "未明确")} 分${raw.scoringCompleteness?.expectedTotal ? `，预期总分 ${esc(raw.scoringCompleteness.expectedTotal)} 分` : ""}。</div>
      <div class="notice warning" style="margin-top:14px">
        <span class="icon-box" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M2 12a10 10 0 1 1 20 0c0 3-1.5 4.5-3 6H5c-1.5-1.5-3-3-3-6z"></path></svg>
        </span>
        <div><strong>响应提示</strong><span>评分项需逐条转化为投标文件章节，证书、业绩、人员承诺等评分材料应在附件中单独列明。</span></div>
      </div>`
    );

    setSectionHtml("section-termination", "废标条款", table(["条款", "风险", "处理建议", "原文页码"], raw.rejectionClauses, ["clause", "risk", "action", "sourcePage"]));

    setSectionHtml(
      "section-requirements",
      "采购需求",
      `
      ${table(
        ["需求项", "具体采购/建设/服务内容", "响应要点", "来源页码"],
        procurementRequirementRows(raw),
        ["item", "requirement", "responsePoint", "sourcePage"]
      )}
      <div class="notice" style="margin-top:14px">
        <span class="icon-box" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4v15.5"></path><path d="M6.5 4H20v13H6.5A2.5 2.5 0 0 0 4 19.5"></path></svg>
        </span>
        <div><strong>解析口径</strong><span>采购需求指客户本次想购买、建设、实施或交付的服务、工程、硬件、软件、系统功能和承包范围；预算、保证金、付款方式和评分办法不作为采购需求展示。</span></div>
      </div>`
    );

    setSectionHtml(
      "section-submission",
      "投标文件要求",
      `
      ${table(["文件要求", "具体要求", "备注"], raw.submissionFormat, ["item", "requirement", "note"])}
      <div style="margin-top:14px">${table(["资料名称", "是否必需", "来源", "备注"], raw.materialsChecklist, ["material", "required", "source", "note"])}</div>
      <div class="grid grid-3" style="margin-top:14px">
        <div>${sectionTitle("商务部分大纲")}${bullets(raw.bidOutline?.businessPart)}</div>
        <div>${sectionTitle("技术部分大纲")}${bullets(raw.bidOutline?.technicalPart)}</div>
        <div>${sectionTitle("附件部分大纲")}${bullets(raw.bidOutline?.attachmentsPart)}</div>
      </div>`
    );

    const bottomStatus = document.querySelector(".bottom-bar .status");
    if (bottomStatus) {
      const itemCount = project.result?.extractedItems || countRows(
        projectBasicInfo,
        basic.keyDates,
        budgetPricing,
        guaranteeInfo,
        qualification.qualificationReview,
        qualification.certificateChecklist,
        raw.procurementRequirements,
        raw.businessReview,
        raw.technicalReview,
        scoringReview,
        raw.rejectionClauses,
        raw.submissionFormat,
        raw.materialsChecklist
      );
      bottomStatus.innerHTML = `
        <span>解析于 ${esc(fmtDate(project.result?.updatedAt || project.uploadTime))}</span>
        <span class="divider" aria-hidden="true"></span>
        <span><strong>${esc(itemCount)}</strong> 个解析项已提取</span>
        <span class="divider" aria-hidden="true"></span>
        <span>${esc(project.fileName || "")}${quality.pageCount ? ` / ${esc(quality.pageCount)} 页` : ""}</span>`;
    }
  };

  const setButtonDisabled = (button, disabled) => {
    if (!button) return;
    button.classList.toggle("opacity-50", disabled);
    button.classList.toggle("cursor-not-allowed", disabled);
    button.setAttribute("aria-disabled", String(disabled));
  };

  const bindLogin = () => {
    if (page !== "index.html" && page !== "login.html") return;

    const account = document.querySelector("#loginAccount");
    const password = document.querySelector("#loginPassword");
    const saved = readState().rememberAccount;
    if (saved && account) account.value = saved;

    if (token()) {
      api(apiPath("/api/session"))
        .then((data) => {
          if (!data.user) return;
          writeState({ user: data.user });
          location.replace(data.user.role === "admin" ? "./admin.html" : "./home.html");
        })
        .catch(() => clearToken());
    }

    const doLogin = async (event) => {
      stop(event);
      if (!account?.value.trim()) {
        toast("请输入账号", "warn");
        account?.focus();
        return;
      }
      if (!password?.value.trim()) {
        toast("请输入密码", "warn");
        password?.focus();
        return;
      }

      const loginAccount = account.value.trim().toLowerCase();
      const loginPassword = password.value.trim();

      try {
        const data = await api(apiPath("/api/login"), {
          method: "POST",
          body: JSON.stringify({ account: loginAccount, password: loginPassword })
        });
        setToken(data.token);
        const remember = document.querySelector(".remember input")?.checked;
        writeState({
          user: data.user,
          rememberAccount: remember ? loginAccount : ""
        });
        location.href = data.user.role === "admin" ? "./admin.html" : "./home.html";
      } catch (error) {
        toast(error.message, "error");
        password.value = "";
        password.focus();
      }
    };

    document.addEventListener(
      "submit",
      (event) => {
        if (event.target.matches("#login, .auth-form")) doLogin(event);
      },
      true
    );

    document.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest("button");
        if (button && button.closest("#login, .auth-form") && textOf(button) === "登录") {
          doLogin(event);
          return;
        }

        const link = event.target.closest("a");
        if (link && textOf(link).includes("忘记密码")) {
          stop(event);
          toast("请联系企业管理员重置密码", "warn");
        }
      },
      true
    );
  };

  const statusMeta = (project) => {
    if (project.status === "failed") return { text: project.message, percent: "--", tone: "red", bar: "bg-red-500", width: 15 };
    if (project.status === "awaiting_lot_selection") return { text: "请选择解析标段", percent: "待选择", tone: "blue", bar: "bg-blue-500", width: 55 };
    if (project.status === "queued") return { text: project.message, percent: "--", tone: "gray", bar: "bg-gray-300", width: 0 };
    if (project.status === "completed") return { text: "解析完成", percent: "100%", tone: "emerald", bar: "bg-emerald-500", width: 100 };
    return { text: project.message || "AI正在解析招标文件", percent: `${project.progress}%`, tone: "amber", bar: "bg-amber-500", width: project.progress };
  };

  const cardHtml = (project) => {
    const meta = statusMeta(project);
    const completed = project.status === "completed";
    const failed = project.status === "failed";
    const awaitingLot = project.status === "awaiting_lot_selection" || project.lotSelectionRequired;
    const secondButton = failed
      ? '<button class="flex-1 px-3 py-2 text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"><i class="fas fa-redo mr-1"></i>重新解析</button>'
      : awaitingLot
        ? '<button class="flex-1 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"><i class="fas fa-layer-group mr-1"></i>选择标段</button>'
      : `<button class="flex-1 px-3 py-2 text-xs font-medium ${completed ? "text-blue-600 bg-blue-50 hover:bg-blue-100" : "text-gray-400 bg-gray-50 cursor-not-allowed"} rounded-lg transition-colors" aria-disabled="${!completed}"><i class="fas fa-eye mr-1"></i>查看解析</button>`;
    const bidButton = hasBidTechnicalChapters(project)
      ? '<i class="fas fa-file-alt mr-1"></i>查看标书'
      : '<i class="fas fa-magic mr-1"></i>生成标书';
    const title = project.name || "未命名项目";
    const safeTitle = esc(title);

    return `
      <div class="project-card bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-lg p-5" data-project-id="${esc(project.id)}" data-upload-time="${esc(project.uploadTime)}" data-title="${safeTitle}">
        <div class="flex items-start justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-900 leading-relaxed line-clamp-2 min-h-[40px]" title="${safeTitle}">${safeTitle}</h3>
        </div>
        <div class="flex items-center gap-2 text-xs text-gray-400 mb-4">
          <span>${fmtDate(project.uploadTime)}</span>
          <span class="w-1 h-1 bg-gray-300 rounded-full"></span>
          <span>${esc(project.fileSizeText || "")}</span>
        </div>
        <div class="mb-3">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs text-${meta.tone}-600 font-medium">${meta.text}</span>
            <span class="text-xs text-${meta.tone}-600 font-semibold">${meta.percent}</span>
          </div>
          <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full ${meta.bar} rounded-full ${project.status === "parsing" ? "progress-animate" : ""}" style="width: ${meta.width}%"></div>
          </div>
        </div>
        <div class="flex items-center gap-2 pt-3 border-t border-gray-100">
          <button class="flex-1 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
            <i class="fas fa-download mr-1"></i>下载招标文件
          </button>
          ${secondButton}
        </div>
        <div class="flex items-center gap-2 mt-2">
          <button class="flex-1 px-3 py-2 text-xs font-medium text-white btn-primary rounded-lg transition-colors ${completed ? "" : "opacity-50 cursor-not-allowed"}" aria-disabled="${!completed}">
            ${bidButton}
          </button>
          <button class="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors ${completed ? "" : "opacity-50 cursor-not-allowed"}" aria-disabled="${!completed}">
            <i class="fas fa-check-double mr-1"></i>标书核验
          </button>
        </div>
      </div>`;
  };

  let projectsCache = [];

  const renderProjectsLoading = () => {
    const grid = document.querySelector(".project-card")?.parentElement || document.querySelector(".grid");
    if (grid) {
      grid.innerHTML = `
        <div class="col-span-3 rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500" data-project-loading>
          正在读取当前账号的项目列表...
        </div>`;
    }
    const label =
      Array.from(document.querySelectorAll("h2"))
        .find((node) => textOf(node).includes("项目列表"))
        ?.parentElement?.querySelector("p") ||
      Array.from(document.querySelectorAll("h2 + p")).find((node) => textOf(node).includes("项目"));
    if (label) label.textContent = "正在读取项目";
  };

  const renderProjects = (projects) => {
    projectsCache = projects;
    const grid = document.querySelector(".project-card")?.parentElement || document.querySelector(".grid");
    if (!grid) return;
    grid.innerHTML = projects.length
      ? projects.map(cardHtml).join("")
      : `<div class="col-span-3 rounded-2xl border border-dashed border-gray-200 bg-white px-8 py-16 text-center">
          <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <i class="fas fa-folder-open text-xl"></i>
          </div>
          <h3 class="text-base font-bold text-gray-900">暂无项目</h3>
          <p class="mt-2 text-sm text-gray-500">当前账号还没有创建项目，上传招标文件后会显示在这里。</p>
        </div>`;
    updateProjectCount(projects.length);
    applySearchAndSort();
    const state = readState();
    const preferredId = state.pendingLotProjectId || state.activeProjectId;
    const pendingLotProject =
      projects.find((project) => project.id === preferredId && project.lotSelectionRequired) ||
      projects.find((project) => project.status === "awaiting_lot_selection" || project.lotSelectionRequired);
    if (pendingLotProject && page === "home.html") {
      writeState({ activeProjectId: pendingLotProject.id, pendingLotProjectId: pendingLotProject.id });
      openLotSelectionModal(pendingLotProject);
    }
  };

  const updateProjectCount = (count) => {
    const label =
      Array.from(document.querySelectorAll("h2"))
        .find((node) => textOf(node).includes("项目列表"))
        ?.parentElement?.querySelector("p") ||
      Array.from(document.querySelectorAll("h2 + p")).find((node) => textOf(node).includes("个项目"));
    if (label) label.textContent = `共 ${count} 个项目`;
  };

  const openBidPageRangeModal = (projectId, options = {}) => {
    document.querySelector("[data-bid-range-modal]")?.remove();
    const currentProject = options.project || projectsCache.find((project) => project.id === projectId);
    const saved = currentProject?.bidPageRange || readState().bidPageRangeByProject?.[projectId] || "100_300";
    const modal = document.createElement("div");
    modal.dataset.bidRangeModal = "true";
    modal.className = "fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/40 px-6";
    modal.innerHTML = `
      <div class="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
        <div class="p-6 border-b border-gray-100">
          <h3 class="text-lg font-bold text-gray-900">选择投标文件内容量</h3>
          <p class="mt-2 text-sm text-gray-500 leading-relaxed">系统会按所选内容量扩写技术目录。商务部分仅保留响应文件格式要求，不做扩写。</p>
        </div>
        <div class="p-5 space-y-3">
          ${bidPageRanges
            .map(
              (item) => `
              <label class="bid-range-option flex gap-3 rounded-xl border ${item.value === saved ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"} p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/60 transition-colors">
                <input class="mt-1 text-blue-600" type="radio" name="bidPageRange" value="${esc(item.value)}" ${item.value === saved ? "checked" : ""}>
                <span class="flex-1">
                  <span class="block text-sm font-bold text-gray-900">${esc(item.label)}</span>
                  <span class="mt-1 block text-xs leading-relaxed text-gray-500">${esc(item.description)}</span>
                </span>
              </label>`
            )
            .join("")}
        </div>
        <div class="flex justify-end gap-3 p-5 border-t border-gray-100 bg-gray-50">
          <button class="h-10 px-4 rounded-lg text-sm font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100" data-action="cancel">取消</button>
          <button class="h-10 px-5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700" data-action="confirm">确认并生成目录</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", async (event) => {
      const option = event.target.closest(".bid-range-option");
      if (option) {
        modal.querySelectorAll(".bid-range-option").forEach((node) => {
          node.classList.remove("border-blue-500", "bg-blue-50");
          node.classList.add("border-gray-200", "bg-white");
        });
        option.classList.add("border-blue-500", "bg-blue-50");
        option.classList.remove("border-gray-200", "bg-white");
      }

      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "cancel") {
        modal.remove();
        return;
      }
      const value = modal.querySelector("input[name='bidPageRange']:checked")?.value || "100_300";
      const confirmButton = modal.querySelector("[data-action='confirm']");
      try {
        setButtonDisabled(confirmButton, true);
        const data = await api(apiPath(`/api/projects/${projectId}/bid-options`), { method: "POST", body: JSON.stringify({ bidPageRange: value }) });
        if (data.project) {
          projectsCache = projectsCache.map((project) => (project.id === projectId ? data.project : project));
          if (!projectsCache.some((project) => project.id === projectId)) projectsCache.unshift(data.project);
        }
        const state = readState();
        writeState({
          activeProjectId: projectId,
          bidPageRangeByProject: { ...(state.bidPageRangeByProject || {}), [projectId]: value }
        });
        modal.remove();
        toast(`已选择${bidPageRangeMeta(value).label}，正在生成目录`);
        if (typeof options.afterSave === "function") {
          await options.afterSave(data.project);
        } else if (options.redirect !== false) {
          window.location.href = "./outline.html";
        }
      } catch (error) {
        setButtonDisabled(confirmButton, false);
        toast(error.message, "error");
      }
    });
  };

  const openLotSelectionModal = (project) => {
    if (!project?.lotSelectionRequired || !Array.isArray(project.lotOptions) || project.lotOptions.length <= 1) return;
    if (document.querySelector("[data-lot-selection-modal]")) return;
    const modal = document.createElement("div");
    modal.dataset.lotSelectionModal = "true";
    modal.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.45);padding:24px;"
    );
    modal.innerHTML = `
      <div style="width:min(720px,100%);max-height:86vh;overflow:hidden;border-radius:18px;background:#fff;border:1px solid #e5e7eb;box-shadow:0 24px 80px rgba(15,23,42,.28);">
        <div style="padding:24px;border-bottom:1px solid #eef2f7;">
          <h3 style="margin:0;font-size:22px;line-height:1.3;font-weight:800;color:#111827;">确认解析标段</h3>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.8;color:#64748b;">当前招标文件包含多个标段，请选择本次要解析的标段。确认后系统会按所选标段重新解析，项目名称会自动追加标段号。</p>
        </div>
        <div style="padding:20px;display:grid;gap:12px;max-height:52vh;overflow:auto;">
          ${project.lotOptions
            .map(
              (lot, index) => `
              <label class="lot-selection-option" style="display:flex;gap:16px;align-items:flex-start;border:1px solid ${index === 0 ? "#3b82f6" : "#e5e7eb"};background:${index === 0 ? "#eff6ff" : "#fff"};border-radius:14px;padding:16px;cursor:pointer;transition:all .16s ease;">
                <input style="margin-top:5px;accent-color:#2563eb;" type="radio" name="lotId" value="${esc(lot.id)}" ${index === 0 ? "checked" : ""}>
                <span style="flex:1;min-width:0;">
                  <span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-size:16px;font-weight:800;color:#111827;">${esc(lot.label)}</span>
                    <span style="font-size:12px;font-weight:700;color:#64748b;border-radius:999px;background:#f1f5f9;padding:4px 8px;">${esc(lot.sourceLabel || "标包")}</span>
                  </span>
                  <span style="display:block;margin-top:8px;font-size:14px;line-height:1.7;color:#475569;">${esc(lot.name || "未识别到单独标段名称")}</span>
                </span>
                <span style="text-align:right;flex:0 0 auto;">
                  <span style="display:block;margin-bottom:4px;font-size:12px;color:#94a3b8;">对应金额</span>
                  <span style="display:block;font-size:17px;font-weight:900;color:#dc2626;">${esc(lot.amount || "未明确")}</span>
                </span>
              </label>`
            )
            .join("")}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:12px;padding:18px 20px;border-top:1px solid #eef2f7;background:#f8fafc;">
          <button style="height:42px;padding:0 20px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:14px;font-weight:800;cursor:pointer;" data-action="confirm-lot">确认标段并开始解析</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", async (event) => {
      const option = event.target.closest(".lot-selection-option");
      if (option) {
        modal.querySelectorAll(".lot-selection-option").forEach((node) => {
          node.style.borderColor = "#e5e7eb";
          node.style.background = "#fff";
        });
        option.style.borderColor = "#3b82f6";
        option.style.background = "#eff6ff";
      }
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action !== "confirm-lot") return;
      const lotId = modal.querySelector("input[name='lotId']:checked")?.value || project.lotOptions[0]?.id;
      const button = event.target.closest("button");
      setButtonDisabled(button, true);
      button.textContent = "正在重新解析...";
      try {
        const data = await api(apiPath(`/api/projects/${project.id}/select-lot`), { method: "POST", body: JSON.stringify({ lotId }) });
        writeState({ activeProjectId: data.project.id, pendingLotProjectId: "" });
        modal.remove();
        toast(`已选择${data.selectedLot?.label || "标段"}，正在重新解析`);
        if (page === "analysis.html") renderAnalysisPending(data.project);
        if (page === "home.html") loadProjects().catch(() => {});
      } catch (error) {
        setButtonDisabled(button, false);
        button.textContent = "确认标段并重新解析";
        toast(error.message, "error");
      }
    });
  };

  const applySearchAndSort = () => {
    const search = document.querySelector("input[placeholder='搜索项目名称...']");
    const select = document.querySelector("select");
    const grid = document.querySelector(".project-card")?.parentElement || document.querySelector(".grid");
    if (!grid) return;
    const keyword = (search?.value || "").trim().toLowerCase();
    const value = displayText(select?.selectedOptions?.[0] || select);
    const cards = Array.from(grid.querySelectorAll(".project-card"));

    cards.forEach((card) => {
      const title = (card.dataset.title || "").toLowerCase();
      card.style.display = title.includes(keyword) ? "" : "none";
    });

    cards
      .sort((a, b) => {
        if (value.includes("升序")) return new Date(a.dataset.uploadTime) - new Date(b.dataset.uploadTime);
        if (value.includes("A-Z")) return (a.dataset.title || "").localeCompare(b.dataset.title || "", "zh-Hans-CN");
        return new Date(b.dataset.uploadTime) - new Date(a.dataset.uploadTime);
      })
      .forEach((card) => grid.appendChild(card));
  };

  let projectsRequestInFlight = false;

  const loadProjects = async (options = {}) => {
    if (projectsRequestInFlight) return;
    projectsRequestInFlight = true;
    if (options.showLoading) renderProjectsLoading();
    try {
      const startedAt = performance.now();
      const data = await api(apiPath("/api/projects"));
      console.debug("[AI投标] 项目列表拉取完成", {
        count: data.projects?.length || 0,
        ms: Math.round(performance.now() - startedAt),
        fields: Object.keys(data.projects?.[0] || {})
      });
      renderProjects(data.projects || []);
    } finally {
      projectsRequestInFlight = false;
    }
  };

  const bindHome = () => {
    if (page !== "home.html") return;
    if (!ensureLogin()) return;

    hydrateCurrentUser().catch((error) => toast(error.message, "error"));
    loadProjects({ showLoading: true }).catch((error) => toast(error.message, "error"));
    const poll = window.setInterval(() => {
      if (document.hidden) return;
      loadProjects().catch(() => {});
    }, 5000);
    window.addEventListener("beforeunload", () => window.clearInterval(poll));

    const uploadArea = document.querySelector(".upload-area");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.doc,.docx,.png,.jpg,.jpeg";
    input.hidden = true;
    document.body.appendChild(input);

    const validateFile = (file) => {
      if (!file) return false;
      if (!/\.(pdf|docx?|png|jpe?g)$/i.test(file.name)) {
        toast("仅支持 PDF、DOCX、DOC、图片格式", "error");
        return false;
      }
      if (file.size > 50 * 1024 * 1024) {
        toast("单文件最大 50MB", "error");
        return false;
      }
      return true;
    };

    let uploadInProgress = false;

    const readFileText = (file, onProgress) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = (event) => {
          if (event.lengthComputable) onProgress?.(event.loaded / event.total);
        };
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
        reader.readAsText(file.slice(0, 120000));
      });

    const readBase64 = (file, onProgress) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = (event) => {
          if (event.lengthComputable) onProgress?.(event.loaded / event.total);
        };
        reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
        reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
        reader.readAsDataURL(file);
      });

    const createProject = async (file) => {
      if (uploadInProgress) {
        toast("已有文件正在上传，请稍候", "warn");
        return;
      }
      uploadInProgress = true;
      showUploadProgress({ fileName: file.name, percent: 1, status: "正在准备文件" });
      try {
        const sourceText = await readFileText(file, (ratio) => {
          showUploadProgress({ fileName: file.name, percent: 5 + ratio * 15, status: "正在读取文件信息" });
        }).catch(() => "");
        const fileBase64 = await readBase64(file, (ratio) => {
          showUploadProgress({ fileName: file.name, percent: 20 + ratio * 50, status: "正在读取招标文件内容" });
        });
        const body = JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          sourceText: sourceText.slice(0, 120000),
          fileBase64
        });
        showUploadProgress({ fileName: file.name, percent: 72, status: "正在上传到服务器" });
        const data = await apiWithUploadProgress(apiPath("/api/projects"), body, (ratio) => {
          showUploadProgress({ fileName: file.name, percent: 72 + ratio * 23, status: "正在上传到服务器" });
        });
        writeState({ activeProjectId: data.project.id });
        showUploadProgress({ fileName: file.name, percent: 98, status: "正在创建项目卡片" });
        if (data.project) renderProjects([data.project, ...projectsCache.filter((item) => item.id !== data.project.id)]);
        await loadProjects();
        showUploadProgress({ fileName: file.name, percent: 100, status: "上传成功，AI解析已开始", tone: "success" });
        toast("已上传招标文件，开始AI解析");
        hideUploadProgress();
      } catch (error) {
        showUploadProgress({ fileName: file.name, percent: 100, status: error.message, tone: "error" });
        hideUploadProgress(2600);
        toast(error.message, "error");
      } finally {
        uploadInProgress = false;
      }
    };

    uploadArea?.addEventListener("click", () => input.click());
    uploadArea?.addEventListener("dragover", (event) => {
      event.preventDefault();
      uploadArea.classList.add("bg-blue-50");
    });
    uploadArea?.addEventListener("dragleave", () => uploadArea.classList.remove("bg-blue-50"));
    uploadArea?.addEventListener("drop", (event) => {
      event.preventDefault();
      uploadArea.classList.remove("bg-blue-50");
      const file = event.dataTransfer.files[0];
      if (validateFile(file)) createProject(file).catch((error) => toast(error.message, "error"));
    });
    input.addEventListener("change", () => {
      const file = input.files[0];
      if (validateFile(file)) createProject(file).catch((error) => toast(error.message, "error"));
      input.value = "";
    });

    document.querySelector("input[placeholder='搜索项目名称...']")?.addEventListener("input", applySearchAndSort);
    document.querySelector("select")?.addEventListener("change", applySearchAndSort);

    document.addEventListener(
      "click",
      async (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const card = button.closest(".project-card");
        const projectId = card?.dataset.projectId;
        const text = textOf(button);

        if (disabledLike(button)) {
          stop(event);
          toast("当前项目未完成解析，暂不能执行该操作", "warn");
          return;
        }

        if (text.includes("选择标段") && projectId) {
          stop(event);
          const project = projectsCache.find((item) => item.id === projectId);
          if (!project) {
            toast("正在读取项目，请稍候", "warn");
            return;
          }
          writeState({ activeProjectId: projectId, pendingLotProjectId: projectId });
          openLotSelectionModal(project);
          return;
        }

        if (projectId && (text.includes("查看解析") || text.includes("生成标书") || text.includes("查看标书") || text.includes("标书核验"))) {
          writeState({ activeProjectId: projectId });
        }

        if (text.includes("生成标书") && projectId) {
          stop(event);
          openBidPageRangeModal(projectId);
          return;
        }

        if (text.includes("下载招标文件") && projectId) {
          stop(event);
          location.href = downloadUrl(projectId, "original");
          toast("已开始下载招标文件");
        }

        if (text.includes("重新解析") && projectId) {
          stop(event);
          try {
            await api(apiPath(`/api/projects/${projectId}/reparse`), { method: "POST", body: "{}" });
            toast("已重新提交AI解析任务");
            await loadProjects();
          } catch (error) {
            toast(error.message, "error");
          }
        }

        if (text.includes("加载更多项目")) {
          stop(event);
          toast("当前账号项目已全部加载");
        }
      },
      true
    );
  };

  const bindAnalysis = () => {
    if (page !== "analysis.html") return;
    if (!ensureLogin()) return;

    hydrateCurrentUser().catch(() => {});
    renderAnalysisPending({ name: "正在读取项目", status: "parsing", progress: 8, message: "正在读取项目解析状态" });
    renderAnalysisPage().catch((error) => toast(error.message, "error"));

    document.addEventListener(
      "click",
      async (event) => {
        const scrollTrigger = event.target.closest("[data-scroll-target]");
        if (scrollTrigger) {
          stop(event);
          const target = document.getElementById(scrollTrigger.dataset.scrollTarget || "");
          if (!target) {
            toast("当前目录对应的正文位置还在生成中", "warn");
            return;
          }
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          target.classList.add("bg-blue-50");
          window.setTimeout(() => target.classList.remove("bg-blue-50"), 1600);
          return;
        }

        const button = event.target.closest("button");
        if (!button) return;
        const text = textOf(button);
        const projectId = await getActiveProjectId();
        if (!projectId) return;

        if (button.dataset.purpose === "analysis-next-action") {
          stop(event);
          writeState({ activeProjectId: projectId });
          location.href = button.dataset.nextTarget === "outline" ? "./outline.html" : "./generate.html";
          return;
        }

        if (text.includes("导出DOCX")) {
          stop(event);
          location.href = downloadUrl(projectId, "analysis-doc");
          toast("解析报告 Word 已生成");
        }
        if (text.includes("导出Excel")) {
          stop(event);
          location.href = downloadUrl(projectId, "analysis-xls");
          toast("解析报告 Excel 已生成");
        }
        if (text.includes("导出PDF")) {
          stop(event);
          location.href = downloadUrl(projectId, "analysis-pdf");
          toast("解析报告 PDF 已生成");
        }
      },
      true
    );
  };

  const bindOutline = () => {
    if (page !== "outline.html") return;
    if (!ensureLogin()) return;

    hydrateCurrentUser().catch(() => {});
    renderOutlinePage().catch((error) => toast(error.message, "error"));

    document.addEventListener(
      "click",
      async (event) => {
        const scrollTrigger = event.target.closest("[data-scroll-target]");
        if (scrollTrigger) {
          stop(event);
          const target = document.getElementById(scrollTrigger.dataset.scrollTarget || "");
          if (!target) {
            toast("当前目录对应的正文位置还在生成中", "warn");
            return;
          }
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          target.classList.add("bg-blue-50");
          window.setTimeout(() => target.classList.remove("bg-blue-50"), 1600);
          return;
        }

        const button = event.target.closest("button");
        if (!button) return;
        const text = textOf(button);
        const tooltip = button.getAttribute("data-tooltip") || "";
        const item = button.closest(".tree-item");
        const label = item?.querySelector(".truncate");

        if (text.includes("编辑")) {
          stop(event);
          if (label) {
            label.contentEditable = "true";
            label.focus();
            toast("已进入目录编辑状态");
          }
        }

        if (text.includes("子项")) {
          stop(event);
          if (item) {
            const clone = item.cloneNode(true);
            clone.classList.add("ml-10");
            const number = clone.querySelector("span");
            const cloneLabel = clone.querySelector(".truncate");
            if (number) number.textContent = "新增";
            if (cloneLabel) cloneLabel.textContent = "新增响应条目";
            item.after(clone);
            toast("已新增子项");
          }
        }

        if (text.includes("删除")) {
          stop(event);
          if (item && document.querySelectorAll(".tree-item").length > 1) {
            item.remove();
            toast("已删除该目录项");
          }
        }

        if (text.includes("保存修改")) {
          stop(event);
          writeState({ outlineSavedAt: new Date().toISOString() });
          toast("目录修改已保存");
        }

        if (tooltip.includes("导出目录")) {
          stop(event);
          const projectId = await getActiveProjectId();
          location.href = downloadUrl(projectId, "outline");
          toast("投标文件大纲 Word 已生成");
        }
      },
      true
    );
  };

  const bindGenerate = () => {
    if (page !== "generate.html") return;
    if (!ensureLogin()) return;

    hydrateCurrentUser().catch(() => {});
    renderGeneratePage().catch((error) => toast(error.message, "error"));

    document.addEventListener(
      "click",
      async (event) => {
        const scrollTrigger = event.target.closest("[data-scroll-target]");
        if (scrollTrigger) {
          stop(event);
          const target = document.getElementById(scrollTrigger.dataset.scrollTarget || "");
          if (!target) {
            toast("当前目录对应的正文位置还在生成中", "warn");
            return;
          }
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          target.classList.add("bg-blue-50");
          window.setTimeout(() => target.classList.remove("bg-blue-50"), 1600);
          return;
        }

        const button = event.target.closest("button");
        if (!button) return;
        const text = textOf(button);
        const projectId = await getActiveProjectId();
        if (!projectId) return;

        const purpose = button.dataset.purpose || "";

        if (disabledLike(button)) {
          stop(event);
          toast(purpose === "download-bid" ? "标书尚未生成完成，暂不能下载" : "当前正在生成，请稍候", "warn");
          return;
        }

        if (purpose === "regenerate-outline") {
          stop(event);
          writeState({ forceRegenerateOutlineProjectId: projectId });
          toast("正在返回生成目录页，重新调用 DeepSeek 生成目录", "warn");
          window.location.href = "./outline.html";
          return;
        }

        if (purpose === "regenerate-bid" || text.includes("重新生成标书")) {
          stop(event);
          toast("正在调用 DeepSeek 重新生成技术部分，请稍候", "warn");
          const current = await getActiveProject();
          renderBidGenerationStatus({ ...current, bidStatus: "generating" }, current?.bidDocument || {}, { generating: true });
          const data = await api(apiPath(`/api/projects/${projectId}/generate-bid`), { method: "POST", body: bidGenerationRequest(current) });
          writeState({ activeProjectId: data.project.id });
          await renderGeneratePage();
          toast(data.project.bidStatus === "generating" ? "DeepSeek 已开始重新生成标书" : "DeepSeek 已重新生成标书技术部分");
          return;
        }

        if (purpose === "download-bid" || text.includes("下载标书")) {
          stop(event);
          const project = await getActiveProject();
          if (!project?.bidDocument) {
            await api(apiPath(`/api/projects/${projectId}/generate-bid`), { method: "POST", body: bidGenerationRequest(project) });
            toast("标书还在生成中，完成后再下载", "warn");
            await renderGeneratePage();
            return;
          }
          location.href = downloadUrl(projectId, "bid");
          toast("投标文件 Word 已生成");
        }
      },
      true
    );
  };

  const selectedVerificationIssueIndex = async () => {
    const projectId = await getActiveProjectId();
    if (!projectId) return 0;
    const state = readState();
    return Number(state.selectedVerificationIssueByProject?.[projectId] || 0);
  };

  const markVerificationIssueSelected = async (index) => {
    const projectId = await getActiveProjectId();
    if (!projectId) return;
    const state = readState();
    writeState({
      selectedVerificationIssueByProject: {
        ...(state.selectedVerificationIssueByProject || {}),
        [projectId]: index
      }
    });
    document.querySelectorAll("[data-verification-issue-card]").forEach((card) => {
      const selected = Number(card.dataset.verificationIssueCard) === index;
      card.classList.toggle("border-blue-300", selected);
      card.classList.toggle("bg-blue-50/30", selected);
      card.classList.toggle("shadow-sm", selected);
      card.classList.toggle("border-surface-200", !selected);
      card.classList.toggle("bg-white", !selected);
    });
  };

  const locateVerificationIssue = async (index) => {
    await markVerificationIssueSelected(index);
    const project = await getActiveProject();
    const issue = project?.verificationDocument?.issues?.[index] || {};
    const target = findBidIssueTarget(issue);
    const scroller = document.querySelector("[data-verification-preview] .overflow-auto");
    if (!target || !scroller) {
      toast("当前问题暂未匹配到投标文件位置", "warn");
      return;
    }
    const scrollTop = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 120;
    scroller.scrollTo({ top: Math.max(0, scrollTop), behavior: "smooth" });
    document.querySelectorAll("[data-bid-target]").forEach((node) => {
      node.classList.remove("bg-amber-100", "ring-2", "ring-amber-300");
    });
    target.classList.add("bg-amber-100", "ring-2", "ring-amber-300");
    window.setTimeout(() => {
      target.classList.remove("bg-amber-100", "ring-2", "ring-amber-300");
    }, 2800);
    toast(`已定位到投标文件第 ${index + 1} 个问题位置`);
  };

  const bindVerification = () => {
    if (page !== "verification.html") return;
    if (!ensureLogin()) return;

    hydrateCurrentUser().catch(() => {});
    renderVerificationPage().catch((error) => toast(error.message, "error"));

    const upload = document.querySelector("#uploadBid");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.doc,.docx";
    input.hidden = true;
    document.body.appendChild(input);
    let bidUploadInProgress = false;
    upload?.addEventListener("click", (event) => {
      stop(event);
      input.click();
    });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      if (bidUploadInProgress) {
        toast("已有标书正在上传，请稍候", "warn");
        return;
      }
      if (!/\.(pdf|docx?)$/i.test(file.name)) {
        toast("仅支持 PDF、DOC、DOCX 格式的投标文件", "error");
        return;
      }
      bidUploadInProgress = true;
      showUploadProgress({ fileName: file.name, percent: 1, status: "正在准备上传标书" });
      try {
        const projectId = await getActiveProjectId();
        if (!projectId) throw new Error("未找到当前项目");
        const body = new FormData();
        body.append("file", file, file.name);
        showUploadProgress({ fileName: file.name, percent: 8, status: "正在上传标书文件" });
        const data = await apiWithUploadProgress(apiPath(`/api/projects/${projectId}/upload-bid`), body, (ratio) => {
          showUploadProgress({ fileName: file.name, percent: 8 + ratio * 82, status: "正在上传标书文件" });
        });
        writeState({ activeProjectId: data.project.id });
        showUploadProgress({ fileName: file.name, percent: 100, status: "上传成功，服务器已完成投标文件解析，可以开始核验", tone: "success" });
        await renderVerificationPage();
        toast("标书已上传，可以开始核验");
        hideUploadProgress();
      } catch (error) {
        showUploadProgress({ fileName: file.name, percent: 100, status: error.message, tone: "error" });
        hideUploadProgress(2600);
        toast(error.message, "error");
      } finally {
        bidUploadInProgress = false;
      }
    });

    document.addEventListener(
      "click",
      async (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const text = textOf(button);
        const projectId = await getActiveProjectId();
        if (!projectId) return;

        const issueCard = button.closest("[data-verification-issue-card]");
        if (issueCard) {
          stop(event);
          await markVerificationIssueSelected(Number(issueCard.dataset.verificationIssueCard || 0));
          return;
        }

        if (text.includes("下载核验文件")) {
          stop(event);
          location.href = downloadUrl(projectId, "verification");
          toast("核验文件 Word 已生成");
          return;
        }

        if (text.includes("定位首个问题")) {
          stop(event);
          await locateVerificationIssue(0);
          return;
        }

        if (text.includes("定位原文")) {
          stop(event);
          await locateVerificationIssue(await selectedVerificationIssueIndex());
          return;
        }

        if (text.includes("开始核验") || text.includes("重新核验")) {
          stop(event);
          renderVerificationLoading("正在重新调用 DeepSeek 对照招标文件与投标文件核验。");
          toast("正在调用 DeepSeek 重新核验", "warn");
          const data = await api(apiPath(`/api/projects/${projectId}/verify`), { method: "POST", body: "{}" });
          writeState({ activeProjectId: data.project.id });
          await renderVerificationPage();
          toast("DeepSeek 核验完成");
        }

        if (text.includes("导出核验报告")) {
          stop(event);
          location.href = downloadUrl(projectId, "verification");
          toast("核验报告 Word 已生成");
        }
      },
      true
    );
  };

  bindLogin();
  bindHome();
  bindAnalysis();
  bindOutline();
  bindGenerate();
  bindVerification();
})();
