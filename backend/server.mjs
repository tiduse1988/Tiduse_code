import http from "node:http";
import { readFile, writeFile, mkdir, stat, rename } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import PDFDocument from "pdfkit";
import { jsonrepair } from "jsonrepair";
import { AlignmentType, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, TextRun } from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const frontendDir = path.join(rootDir, "frontend");
const dataDir = path.join(rootDir, "data");
const uploadsDir = path.join(dataDir, "uploads");
const dbPath = path.join(dataDir, "db.json");

const loadLocalEnv = async () => {
  const envPath = path.join(rootDir, ".env");
  if (!existsSync(envPath)) return;
  const text = await readFile(envPath, "utf-8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index < 1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  });
};

await loadLocalEnv();

const port = Number(process.env.PORT || 8091);
const projectBasePath = `/${(process.env.PROJECT_BASE_PATH || "ai-bid").replace(/^\/+|\/+$/g, "")}`;
const apiBasePath = `${projectBasePath}/api`;
const deepSeekBaseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/g, "");
const deepSeekModel = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const pythonBin = process.env.PYTHON_BIN || "python3";
const deepSeekBidConcurrency = Math.max(1, Math.min(10, Number(process.env.DEEPSEEK_BID_CONCURRENCY || 6)));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".doc": "application/msword; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const nowIso = () => new Date().toISOString();
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const seedDb = {
  users: [
    {
      id: "u_admin",
      account: "admin",
      password: "admin123",
      name: "管理员",
      role: "admin",
      title: "后台管理员",
      enabled: true,
      createdAt: "2026-06-01T09:00:00.000Z"
    },
    {
      id: "u_zhang",
      account: "zhanggong",
      password: "123456",
      name: "张工",
      role: "user",
      title: "高级标书专员",
      enabled: true,
      createdAt: "2026-06-01T09:05:00.000Z"
    },
    {
      id: "u_wang",
      account: "wanggong",
      password: "123456",
      name: "王工",
      role: "user",
      title: "商务经理",
      enabled: true,
      createdAt: "2026-06-01T09:10:00.000Z"
    },
    {
      id: "u_ren",
      account: "renxiaogang",
      password: "123456",
      name: "任小刚",
      role: "user",
      title: "标书专员",
      enabled: true,
      createdAt: "2026-06-04T09:40:00.000Z"
    }
  ],
  sessions: [],
  projects: [
    {
      id: "p_001",
      ownerId: "u_zhang",
      name: "2024年市级智慧政务云平台建设项目",
      fileName: "2024年市级智慧政务云平台建设项目.docx",
      fileSize: 13107200,
      uploadTime: "2026-06-01T09:18:20.000Z",
      status: "parsing",
      progress: 68,
      message: "AI正在生成解析报告",
      bidStatus: "not_started"
    },
    {
      id: "p_002",
      ownerId: "u_zhang",
      name: "2024年城市轨道交通信号系统升级改造工程",
      fileName: "2024年城市轨道交通信号系统升级改造工程.pdf",
      fileSize: 29674700,
      uploadTime: "2026-06-01T08:40:00.000Z",
      status: "completed",
      progress: 100,
      message: "解析完成",
      bidStatus: "generated"
    },
    {
      id: "p_003",
      ownerId: "u_zhang",
      name: "2024年智慧校园信息化建设项目（二期）",
      fileName: "2024年智慧校园信息化建设项目（二期）.pdf",
      fileSize: 16567500,
      uploadTime: "2026-05-31T15:30:00.000Z",
      status: "completed",
      progress: 100,
      message: "解析完成",
      bidStatus: "generated"
    },
    {
      id: "p_004",
      ownerId: "u_zhang",
      name: "2024年市政道路照明设施维护项目",
      fileName: "2024年市政道路照明设施维护项目.doc",
      fileSize: 9017754,
      uploadTime: "2026-05-31T11:20:00.000Z",
      status: "failed",
      progress: 15,
      message: "文件格式异常，无法识别文本内容",
      bidStatus: "not_started"
    },
    {
      id: "p_005",
      ownerId: "u_zhang",
      name: "2024年区属医院信息化系统升级项目",
      fileName: "2024年区属医院信息化系统升级项目.pdf",
      fileSize: 23173500,
      uploadTime: "2026-06-01T10:01:00.000Z",
      status: "queued",
      progress: 0,
      message: "队列中，预计等待 2 分钟",
      bidStatus: "not_started"
    },
    {
      id: "p_006",
      ownerId: "u_wang",
      name: "2024年智慧交通信号优化工程（第一批）",
      fileName: "2024年智慧交通信号优化工程（第一批）.pdf",
      fileSize: 19293800,
      uploadTime: "2026-05-30T08:30:00.000Z",
      status: "completed",
      progress: 100,
      message: "解析完成",
      bidStatus: "generated"
    }
  ],
  results: [
    {
      projectId: "p_001",
      summary: "已提取项目基本信息、商务要求、技术要求、评分标准，报告生成中。",
      extractedItems: 32,
      riskCount: 2,
      updatedAt: "2026-06-01T09:22:10.000Z"
    },
    {
      projectId: "p_002",
      summary: "项目要求包含信号系统升级、设备联调、运维服务和验收资料，技术评分权重较高。",
      extractedItems: 48,
      riskCount: 3,
      updatedAt: "2026-06-01T08:45:00.000Z"
    },
    {
      projectId: "p_003",
      summary: "智慧校园项目重点关注平台建设、数据治理、安全合规和售后服务响应。",
      extractedItems: 44,
      riskCount: 1,
      updatedAt: "2026-05-31T15:38:00.000Z"
    },
    {
      projectId: "p_006",
      summary: "交通信号优化项目已完成解析，建议重点响应施工组织、工期安排和设备兼容要求。",
      extractedItems: 41,
      riskCount: 2,
      updatedAt: "2026-05-30T08:39:00.000Z"
    }
  ],
  auditReports: []
};

const ensureDb = async () => {
  await mkdir(dataDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  if (!existsSync(dbPath)) {
    await writeFile(dbPath, JSON.stringify(seedDb, null, 2), "utf-8");
    return;
  }
  const db = JSON.parse(await readFile(dbPath, "utf-8"));
  db.users = Array.isArray(db.users) ? db.users : [];
  let changed = false;
  seedDb.users.forEach((seedUser) => {
    if (!db.users.some((user) => String(user.account || "").toLowerCase() === seedUser.account.toLowerCase())) {
      db.users.push({ ...seedUser });
      changed = true;
    }
  });
  if (changed) {
    await writeFile(dbPath, JSON.stringify(db, null, 2), "utf-8");
  }
};

const readDb = async () => JSON.parse(await readFile(dbPath, "utf-8"));
let dbWriteQueue = Promise.resolve();
const writeDb = async (db) => {
  const payload = JSON.stringify(db, null, 2);
  dbWriteQueue = dbWriteQueue
    .catch(() => {})
    .then(async () => {
      const tmpPath = `${dbPath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
      await writeFile(tmpPath, payload, "utf-8");
      await rename(tmpPath, dbPath);
    });
  return dbWriteQueue;
};

const send = (res, status, body, headers = {}) => {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
};

const sendJson = (res, status, body) => send(res, status, body, { "Content-Type": "application/json; charset=utf-8" });

const readBody = async (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 90 * 1024 * 1024) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) resolve({});
      else {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("JSON 格式错误"));
        }
      }
    });
  });

const publicUser = (user) => ({
  id: user.id,
  account: user.account,
  name: user.name,
  role: user.role,
  title: user.title,
  enabled: user.enabled !== false,
  createdAt: user.createdAt
});

const getToken = (req, url) => {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return url.searchParams.get("token") || "";
};

const getSession = async (req, url) => {
  const token = getToken(req, url);
  if (!token) return null;
  const db = await readDb();
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) return null;
  if (user.enabled === false) return null;
  return { db, token, user };
};

const requireSession = async (req, res, url) => {
  const session = await getSession(req, url);
  if (!session) {
    sendJson(res, 401, { error: "请先登录" });
    return null;
  }
  return session;
};

const requireAdmin = async (req, res, url) => {
  const session = await requireSession(req, res, url);
  if (!session) return null;
  if (session.user.role !== "admin") {
    sendJson(res, 403, { error: "仅管理员可访问后台数据" });
    return null;
  }
  return session;
};

const sizeText = (size) => `${(Number(size || 0) / 1024 / 1024).toFixed(1)} MB`;
const projectResult = (db, projectId) =>
  db.results.find((item) => item.projectId === projectId) || {
    projectId,
    summary: "尚未生成解析结果",
    extractedItems: 0,
    riskCount: 0,
    updatedAt: ""
  };

const lotNumberText = (value = "") => {
  const text = String(value || "");
  const direct = text.match(/\d+/)?.[0];
  if (direct) return direct;
  const map = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9", 十: "10" };
  const cn = text.match(/[一二三四五六七八九十]/)?.[0];
  return map[cn] || "";
};

const normalizeLotAmount = (value = "") => String(value || "").replace(/\s+/g, "").replace(/[,，]/g, "");

const extractLotOptions = (resultOrRaw = {}, project = {}) => {
  const raw = resultOrRaw.raw || resultOrRaw || {};
  const basic = raw.basicReview || {};
  const rows = [
    ...(basic.projectBasicInfo || []),
    ...(basic.budgetPricing || []),
    ...(basic.guaranteeInfo || []),
    ...(raw.businessReview || []),
    ...(raw.technicalReview || [])
  ];
  const sourceParts = rows.flatMap((row) => [row.item, row.content, row.info, row.requirement, row.note, row.remark, row.responsePoint]).filter(Boolean);
  const found = new Map();

  const addLot = ({ sourceLabel, amount, name = "" }) => {
    const index = lotNumberText(sourceLabel);
    if (!index || !amount) return;
    const key = `lot_${index}`;
    const old = found.get(key) || {};
    const cleanName = String(old.name || name || "").trim();
    found.set(key, {
      id: key,
      index: Number(index),
      label: `标段${index}`,
      sourceLabel: String(sourceLabel || `标包${index}`).replace(/\s+/g, ""),
      name: cleanName,
      amount: normalizeLotAmount(amount)
    });
  };

  for (const row of rows) {
    const labelText = String(row.item || row.content || row.info || "");
    const label = labelText.match(/标(?:包|段|项)\s*[一二三四五六七八九十\d]+/)?.[0];
    const amountText = String(row.info || row.content || row.requirement || "");
    const amount = amountText.match(/[0-9][0-9,，]*(?:\.\d+)?\s*(?:万元|元)/)?.[0];
    if (label && amount) addLot({ sourceLabel: label, amount, name: row.note || row.remark || "" });
  }

  for (const text of sourceParts) {
    const normalized = String(text || "");
    const pattern = /(标(?:包|段|项)\s*[一二三四五六七八九十\d]+)\s*[：:]\s*([0-9][0-9,，]*(?:\.\d+)?\s*(?:万元|元)?)/g;
    let match;
    while ((match = pattern.exec(normalized))) {
      addLot({ sourceLabel: match[1], amount: match[2] });
    }
  }

  return Array.from(found.values()).sort((a, b) => a.index - b.index);
};

const projectLotOptions = (db, project) => {
  if (Array.isArray(project.lotOptions) && project.lotOptions.length) return project.lotOptions;
  return extractLotOptions(projectResult(db, project.id), project);
};

const lotProjectName = (project, selectedLot = project.selectedLot) => {
  const baseName = project.originalName || String(project.name || "未命名项目").replace(/\s*标段\d+\s*$/, "");
  return selectedLot?.label ? `${baseName} ${selectedLot.label}` : baseName;
};

const textMentionsOtherLot = (text = "", selectedLot = {}) => {
  const selected = String(selectedLot.index || lotNumberText(selectedLot.label || selectedLot.sourceLabel || ""));
  if (!selected) return false;
  const matches = String(text || "").match(/标(?:包|段|项)\s*[一二三四五六七八九十\d]+/g) || [];
  return matches.some((match) => {
    const no = lotNumberText(match);
    return no && no !== selected;
  });
};

const filterRowsBySelectedLot = (rows = [], selectedLot = null) => {
  if (!selectedLot || !Array.isArray(rows)) return rows;
  return rows.filter((row) => !textMentionsOtherLot(JSON.stringify(row), selectedLot));
};

const projectDto = (db, project) => {
  const normalized = { ...project };
  if (normalized.bidStatus === "generated" && !normalized.bidDocument?.technicalChapters?.length) {
    normalized.bidStatus = "not_started";
  }
  const lotOptions = projectLotOptions(db, project);
  return {
    ...normalized,
    lotOptions,
    lotSelectionRequired: lotOptions.length > 1 && !project.selectedLot,
    owner: publicUser(db.users.find((user) => user.id === project.ownerId) || {}),
    fileSizeText: sizeText(project.fileSize),
    result: projectResult(db, project.id)
  };
};

const projectListDto = (db, project) => {
  const result = projectResult(db, project.id);
  const resultSummary = {
    extractedItems: result.extractedItems || 0,
    riskCount: result.riskCount || 0,
    updatedAt: result.updatedAt || ""
  };
  const bidGenerated = Array.isArray(project.bidDocument?.technicalChapters) && project.bidDocument.technicalChapters.length > 0;
  const normalizedBidStatus = project.bidStatus === "generated" && !bidGenerated ? "not_started" : project.bidStatus;
  const lotOptions = projectLotOptions(db, project);
  return {
    id: project.id,
    ownerId: project.ownerId,
    name: project.name,
    originalName: project.originalName || "",
    selectedLot: project.selectedLot || null,
    lotOptions,
    lotSelectionRequired: lotOptions.length > 1 && !project.selectedLot,
    fileName: project.fileName,
    fileSize: project.fileSize,
    fileSizeText: sizeText(project.fileSize),
    uploadTime: project.uploadTime,
    status: project.status,
    progress: project.progress,
    message: project.message,
    bidStatus: normalizedBidStatus,
    bidMessage: project.bidMessage || "",
    bidProgress: Number(project.bidProgress || 0),
    bidPageRange: project.bidPageRange || "",
    outlineStatus: project.outlineStatus || "not_started",
    verificationStatus: project.verificationStatus || "not_started",
    owner: publicUser(db.users.find((user) => user.id === project.ownerId) || {}),
    result: resultSummary,
    resultSummary,
    bidGenerated,
    outlineGenerated: Boolean(project.outlineDocument?.technicalPart?.length),
    verificationGenerated: Boolean(project.verificationDocument?.issues || project.verificationDocument?.summary)
  };
};

const canReadProject = (user, project) => user.role === "admin" || project.ownerId === user.id;

const updateProject = async (projectId, patch) => {
  const db = await readDb();
  const project = db.projects.find((item) => item.id === projectId);
  if (!project) return null;
  Object.assign(project, patch);
  await writeDb(db);
  return project;
};

const safeFileName = (value) => String(value || "upload.bin").replace(/[\\/:*?"<>|]/g, "_").slice(0, 160);

const saveUploadedFile = async (projectId, body) => {
  if (!body.fileBase64) return "";
  const fileName = safeFileName(body.fileName);
  const uploadPath = path.join(uploadsDir, `${projectId}-${fileName}`);
  await writeFile(uploadPath, Buffer.from(String(body.fileBase64), "base64"));
  return uploadPath;
};

const runExtractor = (filePath) =>
  new Promise((resolve, reject) => {
    execFile(pythonBin, [path.join(__dirname, "extract_document.py"), filePath], { maxBuffer: 80 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && !stdout) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      try {
        const data = JSON.parse(stdout || "{}");
        if (data.error && !data.fullText) {
          reject(new Error(data.error));
          return;
        }
        resolve(data);
      } catch {
        reject(new Error("正文提取结果解析失败"));
      }
    });
  });

const extractProjectDocument = async (project) => {
  if (!project.filePath) {
    return {
      fileName: project.fileName,
      fileType: path.extname(project.fileName || "").replace(".", ""),
      pageCount: 1,
      charCount: (project.sourceText || "").length,
      tableCount: 0,
      pages: [{ page: 1, text: project.sourceText || "", charCount: (project.sourceText || "").length, tableCount: 0 }],
      tables: [],
      sections: [],
      warnings: project.sourceText ? [] : ["未收到可提取的文件正文。"],
      fullText: project.sourceText || "",
      quality: {
        hasText: Boolean(project.sourceText),
        likelyScanned: false,
        needsOcr: false,
        textCoverage: project.sourceText ? 1 : 0
      }
    };
  }
  return runExtractor(project.filePath);
};

const extractJson = (content) => {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("DeepSeek 未返回 JSON 结构");
    try {
      return JSON.parse(match[0]);
    } catch {
      return JSON.parse(jsonrepair(match[0]));
    }
  }
};

const requestDeepSeek = async ({ apiKey, messages, maxTokens = 6000, temperature = 0.2, signal }) => {
  const response = await fetch(`${deepSeekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: deepSeekModel,
      temperature,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      max_tokens: maxTokens,
      messages
    }),
    signal
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `DeepSeek 请求失败：HTTP ${response.status}`);
  }
  return data;
};

const parseDeepSeekJson = async ({ apiKey, content, signal }) => {
  try {
    return extractJson(content);
  } catch (error) {
    const repair = await requestDeepSeek({
      apiKey,
      signal,
      maxTokens: 12000,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "你是 JSON 修复器。只输出合法 JSON，不要解释，不要 Markdown。保留原有字段和中文内容，修复缺失逗号、缺失括号、非法尾逗号、未转义换行等格式问题。"
        },
        {
          role: "user",
          content: `下面内容不是合法 JSON，请修复为合法 JSON。原解析错误：${error.message}\n\n${content.slice(0, 50000)}`
        }
      ]
    });
    try {
      return extractJson(repair.choices?.[0]?.message?.content || "");
    } catch {
      throw new Error("DeepSeek返回格式异常，已自动修复但仍不是合法JSON，请点击重新解析");
    }
  }
};

const countReportItems = (raw) => {
  const groups = [
    raw.basicReview?.projectBasicInfo,
    raw.basicReview?.keyDates,
    raw.basicReview?.budgetPricing,
    raw.basicReview?.guaranteeInfo,
    raw.qualificationCompliance?.qualificationReview,
    raw.qualificationCompliance?.certificateChecklist,
    raw.businessReview,
    raw.technicalReview,
    raw.scoringReview,
    raw.rejectionClauses,
    raw.submissionFormat,
    raw.materialsChecklist,
    raw.bidOutline?.businessPart,
    raw.bidOutline?.technicalPart,
    raw.bidOutline?.attachmentsPart
  ];
  return groups.reduce((sum, group) => sum + (Array.isArray(group) ? group.length : 0), 0);
};

const findParsedProjectName = (raw) => {
  const fromHeader = raw.projectHeader?.projectName;
  if (fromHeader && !["未明确", "待核实"].includes(String(fromHeader).trim())) return String(fromHeader).trim();

  const basicRows = raw.basicReview?.projectBasicInfo || [];
  const row = basicRows.find((item) => /项目名称|采购项目名称|招标项目名称/.test(String(item.item || item.name || "")));
  const value = row?.content || row?.value;
  if (value && !["未明确", "待核实"].includes(String(value).trim())) return String(value).trim();

  return "";
};

const shouldReplaceProjectName = (project, parsedName) => {
  if (!parsedName) return false;
  const current = String(project.name || "").trim();
  const fileStem = String(project.fileName || "").replace(/\.(pdf|docx?|png|jpe?g)$/i, "").trim();
  return !current || current === "招标文件" || current === "采购文件" || current === fileStem;
};

const bidPageRanges = {
  under_100: { label: "100页以内", target: 8, minChapterChars: 1800, maxTokens: 9000, instruction: "技术目录保持精简，但每章需形成可直接放入标书的完整正文。" },
  "100_300": { label: "100-300页", target: 26, minChapterChars: 5600, maxTokens: 12000, instruction: "按中等厚标扩写技术目录，覆盖评分点、实施细节、质量保障、人员组织、交付验收、设备参数响应和风险控制。" },
  "300_600": { label: "300-600页", target: 30, minChapterChars: 6500, maxTokens: 15000, instruction: "深度扩写技术目录，形成专项方案、质量管理、风险控制、交付保障、运维服务和管理制度章节体系。" },
  over_600: { label: "600页以上", target: 45, minChapterChars: 9000, maxTokens: 16000, instruction: "充分扩写技术目录，面向大型厚标，形成完整专项章节体系和大量可落地正文。" }
};

const bidPageRangeMeta = (value) => bidPageRanges[value] || bidPageRanges.under_100;

const compactOutlineLabel = (value) =>
  stripLeadingNumber(value)
    .replace(/[（(][^（）()]+[）)]\s*$/g, "")
    .replace(/^(?:技术部分|技术响应|技术方案)[：:、，,；;]?\s*/, "")
    .trim();

const directoryDisplayLabel = (value) =>
  stripLeadingNumber(value)
    .replace(/^(?:技术部分|技术响应|技术方案)[：:、，,；;]?\s*/, "")
    .trim();

const pushUniqueOutline = (items, value) => {
  const label = directoryDisplayLabel(value);
  if (!label) return;
  const normalized = compactOutlineLabel(label).replace(/\s+/g, "");
  if (items.some((item) => compactOutlineLabel(item).replace(/\s+/g, "") === normalized)) return;
  items.push(label);
};

const hasThirdLevelHint = (value) => /[（(][^（）()]*[、，,；;][^（）()]*[）)]\s*$/.test(String(value || ""));

const technicalHintFor = (value) => {
  const title = compactOutlineLabel(value);
  if (/设备|仪器|参数|性能指标|雨量计|水位计|ADCP|RTU|终端|电话|全站仪|水准仪|RTK|球机|探照灯|雷达|船/.test(title)) {
    return "参数逐项响应、证明材料、偏离说明、安装调试、验收保障";
  }
  if (/评分|得分|评审/.test(title)) {
    return "评分点拆解、响应章节索引、证明材料、得分保障";
  }
  if (/实施|进度|计划|措施/.test(title)) {
    return "实施步骤、进度安排、责任分工、过程控制、成果提交";
  }
  if (/质量|保证|控制|校核/.test(title)) {
    return "质量目标、检查机制、复核流程、问题整改、记录归档";
  }
  if (/售后|服务|保障|运维|维护/.test(title)) {
    return "响应时限、服务流程、资源保障、问题闭环、持续支持";
  }
  if (/人员|团队|组织|职责/.test(title)) {
    return "组织架构、岗位职责、人员资质、协作机制、替补安排";
  }
  if (/风险|应急|安全|保密/.test(title)) {
    return "风险识别、预防措施、应急流程、责任岗位、恢复目标";
  }
  if (/验收|交付|成果/.test(title)) {
    return "交付清单、验收依据、资料移交、整改闭环、归档要求";
  }
  return "响应目标、实施方法、质量控制、交付成果、风险保障";
};

const ensureTechnicalOutlineDepth = (items) => {
  return (Array.isArray(items) ? items : []).map((item) => {
    const label = directoryDisplayLabel(item);
    if (!label || hasThirdLevelHint(label)) return label;
    return `${label}（${technicalHintFor(label)}）`;
  });
};

const expandTechnicalOutline = (raw, technicalItems, rangeValue) => {
  const range = bidPageRangeMeta(rangeValue);
  const base = (Array.isArray(technicalItems) ? technicalItems : []).filter(Boolean);
  if (range === bidPageRanges.under_100) return base;

  const expanded = [...base];
  const scoringText = JSON.stringify(raw?.scoringReview || []);
  const technicalText = JSON.stringify(raw?.technicalReview || []);
  const allText = `${scoringText}\n${technicalText}`;
  (raw?.scoringReview || [])
    .map((item) => item.category || item.item || "")
    .filter((item) => /技术|方案|服务|质量|人员|团队|项目|实施|培训|运维|售后|响应|安全|保密|进度|业绩|能力/.test(item))
    .forEach((item) => pushUniqueOutline(expanded, `${compactOutlineLabel(item)}专项响应`));

  [
    "项目理解与需求分析",
    "技术响应总体说明",
    "采购需求逐条响应表",
    "评分项逐项响应索引",
    "总体实施方案",
    "项目组织架构与职责分工",
    "项目进度计划与里程碑",
    "质量控制与成果校核方案",
    "人员配置方案",
    "团队专业能力说明",
    "沟通协调机制",
    "文档管理与资料归档方案",
    "重点难点分析及解决措施",
    "风险识别与控制方案",
    "应急响应保障方案",
    "验收交付方案",
    "数据安全与保密管理",
    "培训计划",
    "售后服务与持续支持",
    "创新优化措施"
  ].forEach((item) => {
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

const normalizeOutlineKey = (value) => compactOutlineLabel(value).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").toLowerCase();

const sanitizeTechnicalContent = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .filter((line) => !/报价评审总报价|最低报价评审|小微型企业价格扣除率|扣除后的金额报价|扣除后的下浮率报价|扣除后的折扣报价|投标报价分/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const briefRows = (rows, keys, limit = 4) =>
  (Array.isArray(rows) ? rows : [])
    .slice(0, limit)
    .map((row) =>
      keys
        .map((key) => row?.[key])
        .filter(Boolean)
        .join("：")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 360)
    )
    .filter(Boolean);

const buildFallbackTechnicalContent = (title, project, raw, rangeMeta) => {
  const projectName = project.name || "本项目";
  const requirementBrief =
    briefRows(raw.technicalReview, ["item", "requirement", "responsePoint"], 5).join("；") ||
    "围绕招标文件采购需求、服务要求、质量要求和验收要求逐项响应";
  const technicalScoreRows = (Array.isArray(raw.scoringReview) ? raw.scoringReview : []).filter((row) =>
    /技术|方案|服务|质量|运维|设计|实施|建设|功能|架构|安全|数据|响应|监理|应急|验收/.test(`${row?.category || ""}${row?.criteria || ""}`)
  );
  const scoringBrief =
    briefRows(technicalScoreRows, ["category", "score", "criteria"], 4).join("；") ||
    "围绕评分表技术分、服务质量、实施方案、人员配置、质量控制等要求逐项响应";
  const businessBrief =
    briefRows(raw.businessReview, ["item", "requirement"], 3).join("；") ||
    "同步满足商务条款、服务期限、保密、交付和验收等约束";

  const paragraphs = [
    `本章节围绕“${title}”编制，服务于《${projectName}》投标响应。章节内容以招标文件正文、评分标准和采购需求为依据，重点说明投标人对项目背景、服务目标、工作范围、质量目标和交付边界的理解，确保技术方案既能覆盖招标文件要求，也能在评审时形成清晰、可核验的响应路径。`,
    `针对本章节对应的采购需求，投标人应建立“需求识别、任务分解、责任落实、过程检查、成果确认”的工作闭环。对招标文件明确提出的服务内容、服务标准、时间节点、人员组织、资料提交和验收要求，应逐项建立响应关系，避免出现漏项、弱响应或仅作原则性承诺的情况。当前解析到的关键要求包括：${requirementBrief}。`,
    `在实施方法上，本章节建议从项目启动、资料接收、现场或业务调研、方案细化、过程执行、阶段汇报、问题整改、成果提交等环节展开。每一环节均应明确输入资料、执行动作、责任岗位、输出成果和质量检查方式，并结合项目特点设置复核机制，确保工作内容可追踪、可复盘、可证明。`,
    `在评分响应方面，本章节应把评分表中的技术要求转化为可落地的响应内容，做到“评分点有章节、章节有措施、措施有证明”。系统提取到的评分关注点包括：${scoringBrief}。撰写时应保留评分表原有事项，并在其基础上补充实施细节、控制措施、交付成果、人员安排和风险预案，增强技术响应的完整度。`,
    `在质量与风险控制方面，本章节应设置资料核验、内部评审、过程抽查、成果复核和问题整改机制。对可能影响进度、质量、安全、保密、沟通、验收的风险，应提前提出预防措施和应急处理方式，并与项目联系人、汇报周期、交付节点保持一致，保证项目执行过程稳定可控。`,
    `在交付与文档管理方面，应明确本章节涉及的成果文件、过程记录、会议纪要、检查表、验收材料和归档资料。所有输出内容应按照招标文件格式要求整理，商务资料仍由投标人根据实际证照、业绩、授权、财务、纳税、社保等材料补充，技术部分则应围绕真实服务能力和项目实施方法进行充分阐述。相关商务约束包括：${businessBrief}。`
  ];

  let content = paragraphs.join("\n\n");
  const modules = [
    {
      name: "工作目标与响应边界",
      body: `投标人应在本章节中明确“${title}”对应的工作目标、服务边界和响应范围。凡招标文件已经明确的任务、指标、标准、交付物和时间要求，应逐条纳入响应范围；对招标文件未完全展开但与评分项相关的工作，应以不改变招标要求为前提进行细化说明。该部分应避免空泛表态，建议结合项目建设背景、采购人管理目标、现有业务痛点和预期成果进行描述。`
    },
    {
      name: "实施步骤与过程控制",
      body: "实施过程建议拆分为启动准备、资料接收、需求复核、方案细化、任务执行、过程检查、问题整改、成果提交、验收配合等阶段。每一阶段均应列明责任人、输入资料、工作动作、输出成果、检查方式和时间要求，形成可跟踪、可管理、可审计的执行链条。对跨部门协调、数据获取、现场核验、系统联调、业务确认等关键动作，应设置明确的沟通和确认机制。"
    },
    {
      name: "组织保障与人员安排",
      body: "人员组织应围绕项目经理、技术负责人、质量负责人、实施人员、文档人员、售后或运维人员等角色展开。每类岗位应明确职责边界、协作方式、汇报关系和替补机制。若招标文件对人员数量、资质、经验、驻场、响应时限有要求，应在本章节中逐项响应，并提示具体身份证明、证书、社保、劳动关系或承诺材料由投标人按真实情况补充。"
    },
    {
      name: "质量控制与复核机制",
      body: "质量控制建议采用自检、互检、专检和最终审核相结合的方式。对数据、文档、服务记录、技术成果、验收材料等输出物，应设置统一格式、编号、版本、责任人和复核记录。质量问题应形成发现、登记、分析、整改、复核、关闭的闭环流程，确保每个问题均有处理结果和留痕材料。"
    },
    {
      name: "评分项响应方法",
      body: `本章节应与评分标准建立直接对应关系。对评分表中涉及“${title}”的内容，应在正文中设置可识别的小标题，明确响应措施、实施路径、证明材料和预期效果。对分值较高的评分项，应增加细节描述、流程说明、保障措施和案例化表达，确保评审专家能够快速定位响应内容。`
    },
    {
      name: "风险识别与应急措施",
      body: "风险管理应覆盖进度延误、资料不完整、需求变更、人员变动、质量偏差、数据安全、沟通不畅、验收争议等常见风险。每类风险应明确预防措施、触发条件、应急动作、责任岗位和恢复目标。对影响投标有效性、服务质量或履约结果的风险，应作为重点控制事项进行描述。"
    },
    {
      name: "交付成果与验收配合",
      body: "交付成果应围绕招标文件要求形成清单，明确成果名称、提交时间、提交形式、接收对象、验收依据和归档方式。验收配合应说明投标人如何准备验收资料、响应采购人问题、完成整改闭环和提交最终成果。对于阶段性成果，应设置阶段确认和书面留痕，降低最终验收风险。"
    },
    {
      name: "沟通汇报与文档归档",
      body: "沟通机制应包括例会、专题会、日报或周报、问题清单、风险清单、成果确认单等内容。文档管理应明确版本控制、权限管理、资料移交、保密要求和归档目录。所有与项目实施相关的关键沟通、技术确认、问题整改和成果提交均应形成记录，便于后续审计、验收和运维追溯。"
    }
  ];
  let index = 1;
  while (content.length < rangeMeta.minChapterChars) {
    const module = modules[(index - 1) % modules.length];
    content += `\n\n${index}.${module.name}\n${module.body}\n本模块可结合投标人实际组织能力、人员履历、类似项目经验、工具平台、管理制度和服务承诺进一步细化。补充内容必须与招标文件要求保持一致，不得替换或删除评分表、技术要求和响应文件格式中已经明确的事项。`;
    index += 1;
  }
  content = sanitizeTechnicalContent(content);
  while (content.length < rangeMeta.minChapterChars) {
    const module = modules[(index - 1) % modules.length];
    content += `\n\n${index}.${module.name}\n${module.body}\n本模块用于补足本档位正文深度，确保“${title}”章节能够形成完整技术响应，而不是仅保留原则性说明。`;
    index += 1;
  }
  return sanitizeTechnicalContent(content);
};

const normalizeTechnicalChapters = (chapters, technicalOutline, project, raw, rangeMeta) => {
  const source = Array.isArray(chapters) ? chapters : [];
  const used = new Set();
  let autoCompletedCount = 0;
  const sectionsToContent = (sections = []) =>
    sections
      .map((section) => `${section.heading || "章节内容"}\n${section.content || ""}`.trim())
      .filter(Boolean)
      .join("\n\n");
  const normalizeSections = (sections = []) =>
    sections
      .map((section) => ({
        heading: compactOutlineLabel(section?.heading || ""),
        content: sanitizeTechnicalContent(section?.content || "")
      }))
      .filter((section) => section.heading && section.content);
  const normalized = technicalOutline.map((outlineTitle) => {
    const title = compactOutlineLabel(outlineTitle);
    const key = normalizeOutlineKey(title);
    const matchIndex = source.findIndex((chapter, index) => {
      if (used.has(index)) return false;
      const chapterKey = normalizeOutlineKey(chapter?.title || "");
      return chapterKey && (chapterKey === key || chapterKey.includes(key) || key.includes(chapterKey));
    });
    if (matchIndex >= 0) {
      used.add(matchIndex);
      const chapter = source[matchIndex] || {};
      const sections = normalizeSections(chapter.sections);
      const sectionContent = sectionsToContent(sections);
      const content = sanitizeTechnicalContent(chapter.content || sectionContent);
      if (content.length >= rangeMeta.minChapterChars) return { title: chapter.title || title, content, sections };
      autoCompletedCount += 1;
      const supplement = sanitizeTechnicalContent(buildFallbackTechnicalContent(title, project, raw, rangeMeta));
      return {
        title: chapter.title || title,
        sections,
        content: content ? `${content}\n\n补充扩写：\n${supplement}` : supplement
      };
    }
    autoCompletedCount += 1;
    return { title, content: sanitizeTechnicalContent(buildFallbackTechnicalContent(title, project, raw, rangeMeta)) };
  });

  return { technicalChapters: normalized, autoCompletedCount };
};

const normalizeDirectoryList = (items, fallback = []) => {
  const output = [];
  [...(Array.isArray(items) ? items : []), ...(Array.isArray(fallback) ? fallback : [])].forEach((item) => {
    const label = compactOutlineLabel(item);
    if (!label) return;
    const key = normalizeOutlineKey(label);
    if (output.some((existing) => normalizeOutlineKey(existing) === key)) return;
    output.push(label);
  });
  return output;
};

const normalizeGeneratedOutline = (parsed, raw, bidPageRange) => {
  const outline = raw.bidOutline || {};
  const rangeMeta = bidPageRangeMeta(bidPageRange);
  const businessPart = normalizeDirectoryList(parsed.businessPart, outline.businessPart);
  const attachmentsPart = normalizeDirectoryList(parsed.attachmentsPart, outline.attachmentsPart);
  const deepSeekTechnical = normalizeDirectoryList(parsed.technicalPart, []);
  const requiredTechnical = normalizeDirectoryList(outline.technicalPart, []);
  const fallbackTechnical = expandTechnicalOutline(raw, requiredTechnical, bidPageRange);
  const technicalPart = normalizeDirectoryList([...requiredTechnical, ...deepSeekTechnical], fallbackTechnical);

  const technicalDepth = ensureTechnicalOutlineDepth(technicalPart);

  return {
    businessPart,
    technicalPart: bidPageRange === "under_100" ? technicalDepth.slice(0, Math.max(technicalDepth.length, requiredTechnical.length)) : technicalDepth.slice(0, Math.max(rangeMeta.target, requiredTechnical.length)),
    attachmentsPart
  };
};

const generateOutlineWithDeepSeek = async (project, result, options = {}) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY，无法调用 DeepSeek 生成目录");

  const raw = result.raw || {};
  const outline = project.outlineDocument
    ? {
        businessPart: project.outlineDocument.businessPart || [],
        technicalPart: project.outlineDocument.technicalPart || [],
        attachmentsPart: project.outlineDocument.attachmentsPart || []
      }
    : raw.bidOutline || {};
  const bidPageRange = options.bidPageRange || project.bidPageRange || "under_100";
  const rangeMeta = bidPageRangeMeta(bidPageRange);
  const tenderContext = buildBidGenerationContext(project, raw);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const data = await requestDeepSeek({
      apiKey,
      signal: controller.signal,
      maxTokens: 5000,
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "你是资深投标文件目录策划专家。只输出合法 JSON。必须基于提供的解析报告生成技术部分目录。商务部分按响应文件格式和资格资料保留目录，不得因页数档位扩写；技术部分可按用户选择的投标文件内容量扩写，目录要扩写到三级目录。不得删除评分表和技术要求已有事项。"
        },
        {
          role: "user",
          content: `请生成投标文件目录。\n\n项目名称：${project.name}\n文件名：${project.fileName}\n投标文件内容量档位：${rangeMeta.label}\n目录策略：${rangeMeta.instruction}\n技术目录建议数量：${bidPageRange === "under_100" ? "保持精简，优先保留招标文件明确技术/评分事项" : `不少于${rangeMeta.target}项技术二级目录或三级目录承载点`}\n\n上下文说明：以下内容来自服务端对原始招标文件的完整提取和解析报告结构化结果。原文过长时，系统会优先保留评分办法、响应文件格式、采购需求、技术参数、资格资料、废标条款及相邻页，不能把未展示的非关键页理解为不存在。\n正文范围：${tenderContext.textMode}\n关键页：${(tenderContext.selectedPages || []).join("、") || "全文"}\n文件提取质量：${JSON.stringify(tenderContext.extractionQuality)}\n\n【解析报告结构化内容包】\n${tenderContext.structuredReportText}\n\n【解析出的响应文件格式目录】\n商务部分：${JSON.stringify(outline.businessPart || [])}\n附件部分：${JSON.stringify(outline.attachmentsPart || [])}\n原始技术部分：${JSON.stringify(outline.technicalPart || [])}\n\n【评分标准，必须保留对应响应目录】\n${JSON.stringify(raw.scoringReview || [])}\n\n【技术/服务要求，必须保留对应响应目录】\n${JSON.stringify(raw.technicalReview || [])}\n\n【商务要求，仅用于商务目录，不要扩写为技术内容】\n${JSON.stringify(raw.businessReview || [])}\n\n【资料清单】\n${JSON.stringify(raw.materialsChecklist || [])}\n\n【招标文件关键表格包】\n${JSON.stringify(tenderContext.tenderTables)}\n\n【招标文件关键章节原文包】\n${tenderContext.tenderText}\n\n输出 JSON：\n{\n  "businessPart": ["商务部分目录，按响应文件格式/资格要求，不因页数档位扩写"],\n  "technicalPart": ["技术部分目录，必须覆盖评分表技术要求，可按档位扩写"],\n  "attachmentsPart": ["附件部分目录，按资料清单和资格证明，不因页数档位扩写"],\n  "notes": ["目录生成说明"]\n}\n要求：\n1. 必须针对本招标文件，不要套用固定通用目录。\n2. 商务、资质、证书、业绩、财务、纳税、社保、授权等只保留目录，不编造成正文方向，也不要因页数档位扩写。\n3. 技术部分要依据评分表和技术/服务要求生成；评分表已有事项必须保留，只能扩写不能删除。\n4. 如果用户选择 100-300页、300-600页或600页以上，必须在技术部分按采购需求、评分维度、服务流程、质量控制、风险保障、项目管理、交付验收等维度扩写目录；商务部分不得扩写。\n5. 如目录项括号内是多个具体材料或具体技术维度，可保留括号提示，前端会拆成三级目录；如只是“如适用/服务类/逐条响应采购需求”等提示，不要强行拆。\n6. 不要 Markdown，不要解释，只输出 JSON。`
        }
      ]
    });
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = await parseDeepSeekJson({ apiKey, content, signal: controller.signal });
    const normalized = normalizeGeneratedOutline(parsed, raw, bidPageRange);
    return {
      provider: "DeepSeek",
      model: data.model || deepSeekModel,
      generatedAt: nowIso(),
      bidPageRange,
      bidPageRangeLabel: rangeMeta.label,
      contextMode: tenderContext.textMode,
      contextCharCount: tenderContext.tenderText.length + tenderContext.structuredReportText.length,
      contextReportCharCount: tenderContext.structuredReportText.length,
      contextTableCount: tenderContext.tenderTables.length,
      contextSelectedPages: tenderContext.selectedPages || [],
      ...normalized,
      notes: [
        ...(Array.isArray(parsed.notes) ? parsed.notes : []),
        `已按“${rangeMeta.label}”档位调用 DeepSeek 生成目录，技术目录 ${normalized.technicalPart.length} 项。`
      ]
    };
  } finally {
    clearTimeout(timeout);
  }
};

const scoreMax = (value) => {
  const numbers = String(value ?? "").match(/\d+(?:\.\d+)?/g) || [];
  if (!numbers.length) return String(value ?? "");
  const max = Math.max(...numbers.map(Number));
  return Number.isInteger(max) ? String(max) : String(max).replace(/\.0+$/, "");
};

const cleanScoringCriteria = (value) =>
  String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\n+/g, "")
    .replace(/(\d)\s+(\d)(分钟|分|%|月|日|年|元)/g, "$1$2$3")
    .trim();

const deriveScoringReviewFromExtraction = (extraction = {}) => {
  const rows = [];
  const normalize = (value) => String(value ?? "").replace(/\r/g, "").trim();
  const headerIndex = (header, keyword) => header.findIndex((cell) => normalize(cell).includes(keyword));
  let last = null;

  for (const tableData of extraction.tables || []) {
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
      const step = normalize(row[stepIndex]);
      const factor = normalize(row[factorIndex]);
      const criteria = cleanScoringCriteria(row[criteriaIndex]);
      const score = normalize(row[scoreIndex]);
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

const analyzeWithDeepSeek = async (project) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("未配置 DEEPSEEK_API_KEY，无法调用 DeepSeek 解析");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  const extraction = project.extraction || {};
  const sourceText =
    extraction.fullText ||
    project.sourceText ||
    "当前项目未提取到正文。请基于项目名称、文件名和招标解析任务要求生成待复核结构，并明确标记需要人工复核。";
  const extractionBrief = {
    fileType: extraction.fileType || path.extname(project.fileName || "").replace(".", ""),
    pageCount: extraction.pageCount || 0,
    charCount: extraction.charCount || sourceText.length,
    tableCount: extraction.tableCount || 0,
    sections: extraction.sections || [],
    warnings: extraction.warnings || [],
    quality: extraction.quality || {}
  };
  const tableSamples = (extraction.tables || []).slice(0, 40);
  const sourceSample = sourceText.slice(0, 90000);
  const selectedLot = project.selectedLot || null;
  const selectedLotInstruction = selectedLot
    ? `\n\n【本次标段选择】\n用户已确认只解析：${selectedLot.label}${selectedLot.sourceLabel ? `（招标文件原称：${selectedLot.sourceLabel}）` : ""}${selectedLot.name ? `，名称/范围：${selectedLot.name}` : ""}${selectedLot.amount ? `，金额：${selectedLot.amount}` : ""}。\n本次所有解析结果必须只围绕该标段/标包：项目名称输出为“${lotProjectName(project, selectedLot)}”；预算、最高限价、保证金、采购需求、技术要求、评分标准、资料清单、投标文件大纲都只提取该标段对应内容；跨标段通用条款可以保留，但不得混入其他标段的金额、范围和专属要求。`
    : "";

  try {
    const data = await requestDeepSeek({
      apiKey,
      signal: controller.signal,
      maxTokens: 12000,
      messages: [
        {
          role: "system",
          content:
            "你是专业招投标文件解析助手。请严格输出 JSON，不要输出 Markdown。报告风格参考正式招标文件深度解析报告：分区清晰、以表格字段为主、每项有具体内容/备注/合规判断。必须基于给定正文和表格样本，不得编造确定性事实；缺失内容写“未明确/待核实”。评分标准必须逐条按招标文件原文提取，不得总结、删减、改写；分值字段只填写该项最高分。"
        },
        {
          role: "user",
          content: `请按“深度解析报告”结构解析以下招标文件，并返回 JSON。${selectedLotInstruction}\n\n项目名称：${lotProjectName(project, selectedLot)}\n文件名：${project.fileName}\n文件大小：${sizeText(project.fileSize)}\n服务端提取质量：${JSON.stringify(extractionBrief)}\n表格样本：${JSON.stringify(tableSamples).slice(0, 30000)}\n正文：${sourceSample}\n\nJSON 字段必须包含：\n{\n  "summary": "报告摘要，概括项目、范围、关键风险，100-180字",\n  "extractedItems": 数字,\n  "riskCount": 数字,\n  "manualReviewRequired": true或false,\n  "projectHeader": {"projectName":"","bidNo":"","tenderee":"","agency":"","analysisDate":"","version":"V1.0"},\n  "basicReview": {\n    "projectBasicInfo": [{"item":"项目名称","content":"","remark":""}],\n    "keyDates": [{"node":"时间节点","time":"","reminder":""}],\n    "budgetPricing": [{"item":"价格要素","info":"","note":""}],\n    "guaranteeInfo": [{"item":"保证金要素","requirement":"","note":""}]\n  },\n  "qualificationCompliance": {\n    "qualificationReview": [{"item":"审查项目","requirement":"","evidence":"证明材料","judgement":"可通过/建议核实/高风险/未明确"}],\n    "certificateChecklist": [{"name":"证照名称","required":"必须/可选/未明确","issuer":"","validity":"","sealed":"是/否/未明确","source":"获取方式或来源"}]\n  },\n  "businessReview": [{"item":"商务要求","requirement":"","responsePoint":"","riskLevel":"低/中/高"}],\n  "technicalReview": [{"item":"技术或服务要求","requirement":"","responsePoint":"","scoreRelated":"是/否/未明确"}],\n  "scoringReview": [{"category":"评分项","score":"只填最高分，如10/15/30","criteria":"从招标文件评分细则逐字粘贴完整原文，不得删减改写","responseStrategy":"","sourcePage":"页码或未明确"}],\n  "rejectionClauses": [{"clause":"废标/无效条款","risk":"","action":""}],\n  "submissionFormat": [{"item":"文件格式要求","requirement":"","note":""}],\n  "materialsChecklist": [{"material":"资料名称","required":"必须/可选/未明确","source":"来源","note":""}],\n  "bidOutline": {\n    "businessPart": ["必须依据响应文件格式要求生成商务目录"],\n    "technicalPart": ["必须依据评分表技术要求生成技术目录"],\n    "attachmentsPart": ["依据资格/资料清单生成附件目录"]\n  },\n  "extractionQuality": {"pageCount":数字,"charCount":数字,"tableCount":数字,"textCoverage":数字,"warnings":["完整性或OCR提示"]}\n}`
        }
      ]
    });

    const content = data.choices?.[0]?.message?.content || "";
    const parsed = await parseDeepSeekJson({ apiKey, content, signal: controller.signal });
    const exactScoringReview = deriveScoringReviewFromExtraction(extraction);
    if (exactScoringReview.length) parsed.scoringReview = filterRowsBySelectedLot(exactScoringReview, selectedLot);
    if (selectedLot) {
      parsed.projectHeader = { ...(parsed.projectHeader || {}), projectName: lotProjectName(project, selectedLot) };
      if (parsed.basicReview?.projectBasicInfo) {
        const nameRow = parsed.basicReview.projectBasicInfo.find((row) => /项目名称/.test(row.item || ""));
        if (nameRow) nameRow.content = lotProjectName(project, selectedLot);
      }
      if (parsed.basicReview?.budgetPricing) parsed.basicReview.budgetPricing = filterRowsBySelectedLot(parsed.basicReview.budgetPricing, selectedLot);
      if (parsed.basicReview?.guaranteeInfo) parsed.basicReview.guaranteeInfo = filterRowsBySelectedLot(parsed.basicReview.guaranteeInfo, selectedLot);
      if (parsed.businessReview) parsed.businessReview = filterRowsBySelectedLot(parsed.businessReview, selectedLot);
      if (parsed.technicalReview) parsed.technicalReview = filterRowsBySelectedLot(parsed.technicalReview, selectedLot);
      if (parsed.scoringReview) parsed.scoringReview = filterRowsBySelectedLot(parsed.scoringReview, selectedLot);
      if (parsed.materialsChecklist) parsed.materialsChecklist = filterRowsBySelectedLot(parsed.materialsChecklist, selectedLot);
    }
    const countedItems = countReportItems(parsed);
    const parsedProjectName = findParsedProjectName(parsed);
    return {
      projectId: project.id,
      summary: parsed.summary || "DeepSeek 已返回解析结果，请进入解析报告查看详情。",
      extractedItems: Number(parsed.extractedItems || countedItems || 0),
      riskCount: Number(parsed.riskCount || 0),
      updatedAt: nowIso(),
      model: data.model || deepSeekModel,
      provider: "deepseek",
      extractionQuality: extractionBrief,
      parsedProjectName,
      raw: parsed
    };
  } finally {
    clearTimeout(timeout);
  }
};

const CONTEXT_TEXT_BUDGET = 105000;
const REPORT_CONTEXT_BUDGET = 36000;
const TABLE_CONTEXT_BUDGET = 32000;

const compactStringify = (value, maxChars = REPORT_CONTEXT_BUDGET) => {
  const text = JSON.stringify(value ?? "", null, 2);
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n【内容过长，已截断】` : text;
};

const buildStructuredReportText = (raw = {}) => {
  const sections = [
    ["项目头信息", raw.projectHeader],
    ["项目基本信息", raw.basicReview?.projectBasicInfo],
    ["重要时间节点", raw.basicReview?.keyDates],
    ["预算与报价", raw.basicReview?.budgetPricing],
    ["保证金信息", raw.basicReview?.guaranteeInfo],
    ["资格审查", raw.qualificationCompliance],
    ["商务要求", raw.businessReview],
    ["技术/服务要求", raw.technicalReview],
    ["评分标准", raw.scoringReview],
    ["废标/无效条款", raw.rejectionClauses],
    ["响应文件格式", raw.submissionFormat],
    ["资料清单", raw.materialsChecklist],
    ["解析阶段大纲", raw.bidOutline],
    ["提取质量", raw.extractionQuality]
  ];
  const chunks = [];
  let total = 0;
  for (const [title, value] of sections) {
    if (value === undefined || value === null) continue;
    const chunk = `【${title}】\n${compactStringify(value, Math.min(12000, REPORT_CONTEXT_BUDGET))}`;
    if (total + chunk.length > REPORT_CONTEXT_BUDGET) break;
    chunks.push(chunk);
    total += chunk.length;
  }
  return chunks.join("\n\n---\n\n") || "解析报告结构化内容为空，请以招标文件原文为准。";
};

const keySectionPatterns = [
  { label: "评分标准", score: 120, pattern: /评标办法|评分标准|评审标准|评审因素|评分因素|分值|技术评分|商务评分|综合评分/ },
  { label: "响应文件格式", score: 115, pattern: /投标文件格式|响应文件格式|响应文件组成|资格审查资料|商务和技术偏差|投标函|授权委托|开标一览表|报价明细/ },
  { label: "采购需求", score: 105, pattern: /采购需求|项目需求|服务内容|服务范围|建设内容|供货要求|设备清单|清单及参数/ },
  { label: "技术要求", score: 105, pattern: /技术要求|技术参数|服务要求|实施方案|运维服务|质量要求|验收要求|交付要求/ },
  { label: "资格条件", score: 95, pattern: /资格条件|资格要求|资格审查|投标人资格|供应商资格|营业执照|财务|纳税|社保|业绩|信誉|认证证书/ },
  { label: "商务要求", score: 85, pattern: /商务要求|商务条款|合同条款|服务期|工期|付款方式|报价要求|投标保证金|履约保证金/ },
  { label: "废标条款", score: 82, pattern: /废标|无效投标|否决投标|实质性要求|不允许偏差|重大偏差|投标无效/ },
  { label: "附件资料", score: 70, pattern: /附件|资料清单|证明材料|承诺函|声明函|中小企业|残疾人福利|监狱企业/ }
];

const pageText = (page) => String(page?.text || "");

const selectedKeyPages = (extraction = {}, maxPages = 36) => {
  const pages = Array.isArray(extraction.pages) ? extraction.pages : [];
  const selected = new Map();
  const addPage = (pageIndex, score, labels) => {
    if (pageIndex < 0 || pageIndex >= pages.length) return;
    const page = pages[pageIndex];
    const pageNo = Number(page.page || pageIndex + 1);
    const existing = selected.get(pageNo) || { page, score: 0, labels: new Set() };
    existing.score += score;
    labels.forEach((label) => existing.labels.add(label));
    selected.set(pageNo, existing);
  };

  pages.forEach((page, index) => {
    const text = pageText(page);
    if (!text.trim()) return;
    const hits = keySectionPatterns.filter((item) => item.pattern.test(text));
    if (!hits.length) return;
    const score = hits.reduce((sum, item) => sum + item.score, 0);
    const labels = hits.map((item) => item.label);
    addPage(index, score, labels);
    if (hits.some((item) => item.score >= 100)) {
      addPage(index - 1, 20, labels.map((label) => `${label}相邻页`));
      addPage(index + 1, 20, labels.map((label) => `${label}相邻页`));
    }
  });

  return [...selected.values()]
    .sort((a, b) => b.score - a.score || Number(a.page.page || 0) - Number(b.page.page || 0))
    .slice(0, maxPages)
    .sort((a, b) => Number(a.page.page || 0) - Number(b.page.page || 0));
};

const buildKeySectionText = (extraction = {}, fullText = "", maxChars = CONTEXT_TEXT_BUDGET) => {
  if (fullText && fullText.length <= maxChars) {
    return {
      text: `【招标文件全文】\n${fullText}`,
      mode: "完整招标文件正文",
      selectedPages: []
    };
  }

  const selected = selectedKeyPages(extraction);
  const chunks = [];
  let total = 0;
  for (const item of selected) {
    const rawText = pageText(item.page).trim();
    if (!rawText) continue;
    const pageNo = item.page.page || "";
    const labels = [...item.labels].join("、");
    const chunk = `【关键原文：第${pageNo}页｜命中：${labels}】\n${rawText.slice(0, 7000)}`;
    if (total + chunk.length > maxChars) break;
    chunks.push(chunk);
    total += chunk.length;
  }

  if (!chunks.length) {
    return {
      text: `【招标文件正文前段】\n${fullText.slice(0, maxChars)}`,
      mode: "招标文件正文前段（未识别到关键页）",
      selectedPages: []
    };
  }

  return {
    text: chunks.join("\n\n---\n\n"),
    mode: "招标文件关键章节原文包（优先评分/格式/采购需求/技术/资格/废标及相邻页）",
    selectedPages: selected.map((item) => `第${item.page.page || ""}页`).filter(Boolean)
  };
};

const selectTenderTables = (tables = [], maxChars = TABLE_CONTEXT_BUDGET) => {
  const scored = (Array.isArray(tables) ? tables : [])
    .map((table, index) => {
      const text = JSON.stringify(table);
      const score = keySectionPatterns.reduce((sum, item) => sum + (item.pattern.test(text) ? item.score : 0), 0);
      return { table, index, text, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const source = scored.length ? scored : (Array.isArray(tables) ? tables : []).slice(0, 25).map((table, index) => ({ table, index, text: JSON.stringify(table), score: 0 }));
  const output = [];
  let total = 0;
  for (const item of source) {
    const payload = { page: item.table.page, rows: item.table.rows };
    const text = JSON.stringify(payload);
    if (total + text.length > maxChars) break;
    output.push(payload);
    total += text.length;
  }
  return output;
};

const buildBidGenerationContext = (project, raw = {}) => {
  const extraction = project.extraction || {};
  const fullText = String(extraction.fullText || project.sourceText || "");
  const keyText = buildKeySectionText(extraction, fullText);
  const tenderTables = selectTenderTables(extraction.tables || []);
  const structuredReportText = buildStructuredReportText(raw);

  return {
    textMode: keyText.mode,
    tenderText: keyText.text,
    tenderTables,
    structuredReportText,
    selectedPages: keyText.selectedPages,
    extractionQuality: {
      pageCount: extraction.pageCount || 0,
      charCount: extraction.charCount || fullText.length,
      tableCount: extraction.tableCount || tenderTables.length,
      warnings: extraction.warnings || []
    }
  };
};

const bidOutlineEntry = (item) => {
  const model = outlineItemModel(item);
  const fallbackChildren = technicalHintFor(item)
    .split(/[、，,；;]/)
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    title: model.label || directoryDisplayLabel(item),
    children: model.children.length ? model.children : fallbackChildren
  };
};

const relevantRowsForChapter = (rows, outlineEntry, limit = 10) => {
  const keywords = [outlineEntry.title, ...(outlineEntry.children || [])]
    .join(" ")
    .split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  const source = Array.isArray(rows) ? rows : [];
  const scored = source
    .map((row, index) => {
      const text = JSON.stringify(row || {});
      const score = keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
      return { row, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.row);
  return scored.length ? scored : source.slice(0, Math.min(4, limit));
};

const generatedSectionPlainText = (sections = []) =>
  (Array.isArray(sections) ? sections : [])
    .map((section, index) => {
      const heading = section?.heading || `小节${index + 1}`;
      const content = String(section?.content || "").trim();
      return `${index + 1}.${heading}\n${content}`;
    })
    .join("\n\n")
    .trim();

const chunkList = (items = [], size = 3) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

const createAsyncLimiter = (limit) => {
  const max = Math.max(1, Number(limit || 1));
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= max || !queue.length) return;
    const { task, resolve, reject } = queue.shift();
    active += 1;
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        runNext();
      });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      runNext();
    });
};

const mapWithConcurrency = async (items, limit, worker) => {
  const output = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return output;
};

const generateBidChapterWithDeepSeek = async ({ apiKey, project, raw, tenderContext, outlineEntry, chapterIndex, chapterTotal, rangeMeta }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  const chapterRows = {
    technicalReview: relevantRowsForChapter(raw.technicalReview || [], outlineEntry, 12),
    scoringReview: relevantRowsForChapter(raw.scoringReview || [], outlineEntry, 12),
    businessReview: relevantRowsForChapter(raw.businessReview || [], outlineEntry, 5)
  };

  try {
    const data = await requestDeepSeek({
      apiKey,
      signal: controller.signal,
      maxTokens: Math.min(6500, rangeMeta.maxTokens),
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "你是资深投标文件技术标撰写专家。只输出合法 JSON。必须根据招标文件和解析报告撰写投标响应正文，不能复制粘贴招标文件原文，不能把评分细则原文当正文。内容应体现投标人的实施方案、服务方法、组织保障、质量控制、交付验收和风险控制。"
        },
        {
          role: "user",
          content: `请按当前技术目录单独撰写投标文件正文。\n\n项目名称：${project.name}\n文件名：${project.fileName}\n投标文件内容量档位：${rangeMeta.label}\n当前章节：第 ${chapterIndex + 1}/${chapterTotal} 章\n二级目录：${outlineEntry.title}\n必须生成的三级目录：${JSON.stringify(outlineEntry.children || [])}\n每个三级目录正文建议不少于 500 字，不能只写口号。\n\n【解析报告结构化内容包】\n${tenderContext.structuredReportText.slice(0, 26000)}\n\n【本章节相关技术/评分/商务要求】\n${JSON.stringify(chapterRows).slice(0, 22000)}\n\n【招标文件关键表格包】\n${JSON.stringify(tenderContext.tenderTables).slice(0, 16000)}\n\n【招标文件关键章节原文包，仅作为背景和约束，不得复制成正文】\n${tenderContext.tenderText.slice(0, 38000)}\n\n输出 JSON：\n{\n  "title": "${outlineEntry.title}",\n  "sections": [\n    {"heading": "三级目录标题，不带编号", "content": "围绕该三级目录撰写的投标响应正文"}\n  ],\n  "notes": ["需要人工补充的真实材料或报价事项"]\n}\n要求：\n1. sections 必须覆盖上方“必须生成的三级目录”，顺序一致。\n2. 内容是投标响应方案，不是招标文件摘抄；严禁大段复制招标文件原文、评分细则原文或参数表原文。\n3. 可以引用招标文件要求的方向，但要转化为“我方拟采取的措施、流程、保障、交付和检查方法”。\n4. 不得编造投标人真实资质、证书、业绩、人员姓名、报价金额。涉及这些内容写“由投标人按实际情况提供”。\n5. 不要 Markdown，不要解释，只输出 JSON。`
        }
      ]
    });
    const parsed = await parseDeepSeekJson({ apiKey, content: data.choices?.[0]?.message?.content || "", signal: controller.signal });
    const expectedChildren = outlineEntry.children || [];
    const sourceSections = Array.isArray(parsed.sections) ? parsed.sections : [];
    const sections = expectedChildren.map((child, index) => {
      const childKey = normalizeOutlineKey(child);
      const matched = sourceSections.find((section) => {
        const headingKey = normalizeOutlineKey(section?.heading || "");
        return headingKey && (headingKey.includes(childKey) || childKey.includes(headingKey));
      }) || sourceSections[index] || {};
      return {
        heading: child,
        content: sanitizeTechnicalContent(matched.content || buildFallbackTechnicalContent(`${outlineEntry.title}-${child}`, project, raw, rangeMeta))
      };
    });
    const content = generatedSectionPlainText(sections);
    return {
      title: parsed.title || outlineEntry.title,
      sections,
      content: sanitizeTechnicalContent(content),
      notes: Array.isArray(parsed.notes) ? parsed.notes : []
    };
  } finally {
    clearTimeout(timeout);
  }
};

const generateBidWithDeepSeek = async (project, result, options = {}) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY，无法调用 DeepSeek 生成标书");

  const raw = result.raw || {};
  const outline = project.outlineDocument
    ? {
        businessPart: project.outlineDocument.businessPart || [],
        technicalPart: project.outlineDocument.technicalPart || [],
        attachmentsPart: project.outlineDocument.attachmentsPart || []
      }
    : raw.bidOutline || {};
  const bidPageRange = options.bidPageRange || project.bidPageRange || "under_100";
  const rangeMeta = bidPageRangeMeta(bidPageRange);
  const technicalOutline = project.outlineDocument?.technicalPart?.length
    ? outline.technicalPart
    : expandTechnicalOutline(raw, outline.technicalPart || [], bidPageRange);
  const tenderContext = buildBidGenerationContext(project, raw);
  const outlineEntries = technicalOutline.map(bidOutlineEntry).filter((entry) => entry.title);

  const runDeepSeekTask = createAsyncLimiter(deepSeekBidConcurrency);
  let completedChapters = 0;
  if (typeof options.onProgress === "function") {
    await options.onProgress({
      done: 0,
      total: outlineEntries.length,
      title: `并发启动 ${Math.min(deepSeekBidConcurrency, outlineEntries.length)} 路 DeepSeek 生成任务`,
      percent: 3
    });
  }

  const generatedResults = await Promise.all(outlineEntries.map(async (entry, index) => {
    if (typeof options.onProgress === "function") {
      await options.onProgress({
        done: completedChapters,
        total: outlineEntries.length,
        title: entry.title,
        percent: Math.max(3, Math.round((completedChapters / Math.max(1, outlineEntries.length)) * 100))
      });
    }
    try {
      let chapter;
      if (entry.children.length > 3) {
        const sections = [];
        const notes = [];
        const childChunks = chunkList(entry.children, 3);
        const childChapters = await Promise.all(childChunks.map((childChunk) =>
          runDeepSeekTask(() =>
            generateBidChapterWithDeepSeek({
              apiKey,
              project,
              raw,
              tenderContext,
              outlineEntry: { title: entry.title, children: childChunk },
              chapterIndex: index,
              chapterTotal: outlineEntries.length,
              rangeMeta
            })
          )
        ));
        childChapters.forEach((childChapter) => {
          sections.push(...(childChapter.sections || []));
          notes.push(...(childChapter.notes || []));
        });
        chapter = {
          title: entry.title,
          sections,
          content: generatedSectionPlainText(sections),
          notes: [`${entry.title} 已按 ${childChunks.length} 组三级目录分批生成。`, ...notes]
        };
      } else {
        chapter = await runDeepSeekTask(() =>
          generateBidChapterWithDeepSeek({
            apiKey,
            project,
            raw,
            tenderContext,
            outlineEntry: entry,
            chapterIndex: index,
            chapterTotal: outlineEntries.length,
            rangeMeta
          })
        );
      }
      completedChapters += 1;
      if (typeof options.onProgress === "function") {
        await options.onProgress({
          done: completedChapters,
          total: outlineEntries.length,
          title: entry.title,
          percent: Math.round((completedChapters / Math.max(1, outlineEntries.length)) * 100)
        });
      }
      return { chapter, notes: chapter.notes || [] };
    } catch (error) {
      const fallbackChapter = {
        title: entry.title,
        sections: entry.children.map((child) => ({
          heading: child,
          content: sanitizeTechnicalContent(buildFallbackTechnicalContent(`${entry.title}-${child}`, project, raw, rangeMeta))
        })),
        content: sanitizeTechnicalContent(buildFallbackTechnicalContent(entry.title, project, raw, rangeMeta)),
        notes: [`${entry.title} 使用系统兜底扩写：${error.message || "DeepSeek 分章生成失败"}`]
      };
      completedChapters += 1;
      if (typeof options.onProgress === "function") {
        await options.onProgress({
          done: completedChapters,
          total: outlineEntries.length,
          title: entry.title,
          percent: Math.round((completedChapters / Math.max(1, outlineEntries.length)) * 100)
        });
      }
      return {
        chapter: fallbackChapter,
        notes: [`${entry.title} 使用系统兜底扩写：${error.message || "DeepSeek 分章生成失败"}`]
      };
    }
  }));

  const technicalChapters = generatedResults.map((item) => item.chapter);
  const chapterNotes = generatedResults.flatMap((item) => item.notes || []);

  const normalizedTechnical = normalizeTechnicalChapters(technicalChapters, technicalOutline, project, raw, rangeMeta);
  const normalizedByTitle = new Map(normalizedTechnical.technicalChapters.map((chapter) => [normalizeOutlineKey(chapter.title), chapter]));
  const finalTechnical = technicalChapters.map((chapter) => {
    const normalized = normalizedByTitle.get(normalizeOutlineKey(chapter.title));
    if (!normalized) return chapter;
    return { ...chapter, content: normalized.content || chapter.content };
  });

  return {
    provider: "DeepSeek",
    model: deepSeekModel,
    generatedAt: nowIso(),
    generationMode: "按技术目录分章生成",
    contextMode: tenderContext.textMode,
    bidPageRange,
    bidPageRangeLabel: rangeMeta.label,
    contextCharCount: tenderContext.tenderText.length + tenderContext.structuredReportText.length,
    contextTableCount: tenderContext.tenderTables.length,
    businessDirectory: outline.businessPart || [],
    attachmentDirectory: outline.attachmentsPart || [],
    technicalChapters: finalTechnical,
    generationNotes: [
      `已按“${rangeMeta.label}”档位并发调用 DeepSeek 生成正文，并发上限 ${deepSeekBidConcurrency} 路，共 ${finalTechnical.length} 个技术章节。`,
      "商务、资质、证照、业绩、报价等真实材料仅保留目录，需投标人按实际情况补充。",
      ...chapterNotes.slice(0, 20),
      ...(normalizedTechnical.autoCompletedCount
        ? [`系统已按招标文件解析结果对 ${normalizedTechnical.autoCompletedCount} 个技术章节进行补充扩写，确保章节数量和正文长度符合所选档位。`]
        : [])
    ]
  };
};

const generateVerificationWithDeepSeek = async (project, result) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY，无法调用 DeepSeek 核验标书");
  if (!project.bidDocument?.technicalChapters?.length) throw new Error("投标文件尚未生成，不能进行 DeepSeek 核验");

  const raw = result.raw || {};
  const tenderContext = buildBidGenerationContext(project, raw);
  const bidText = bidDocumentPlainText(project.bidDocument);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const data = await requestDeepSeek({
      apiKey,
      signal: controller.signal,
      maxTokens: 9000,
      temperature: 0.15,
      messages: [
        {
          role: "system",
          content:
            "你是专业标书核验专家。只输出合法 JSON。你必须对照招标文件、解析结果和投标文件逐项核验，不得使用示例数据。重点检查硬性条款、评分项响应、技术要求覆盖、商务/附件材料缺失、格式和风险。不能因为投标文件是AI生成就默认通过；缺少真实资质、证书、业绩、报价等材料必须标为待补/高风险。"
        },
        {
          role: "user",
          content: `请对以下投标文件进行核验。\n\n项目名称：${project.name}\n文件名：${project.fileName}\n\n【招标文件解析结果】\n项目基础信息：${JSON.stringify(raw.basicReview || {})}\n资格审查：${JSON.stringify(raw.qualificationCompliance || {})}\n商务要求：${JSON.stringify(raw.businessReview || [])}\n技术要求：${JSON.stringify(raw.technicalReview || [])}\n评分标准：${JSON.stringify(raw.scoringReview || [])}\n废标条款：${JSON.stringify(raw.rejectionClauses || [])}\n文件格式：${JSON.stringify(raw.submissionFormat || [])}\n资料清单：${JSON.stringify(raw.materialsChecklist || [])}\nDeepSeek生成目录：${JSON.stringify(project.outlineDocument || raw.bidOutline || {})}\n\n【招标文件表格】\n${JSON.stringify(tenderContext.tenderTables).slice(0, 50000)}\n\n【招标文件正文】\n${tenderContext.tenderText.slice(0, 90000)}\n\n【待核验投标文件】\n${bidText.slice(0, 100000)}\n\n输出 JSON：\n{\n  "overallStatus": "通过/需修改/高风险",\n  "score": 0到100的整数,\n  "summary": "核验摘要，说明主要风险和可提交程度",\n  "checkedItems": 数字,\n  "passedCount": 数字,\n  "mustFixCount": 数字,\n  "warningCount": 数字,\n  "dimensions": [{\"name\":\"资格材料完整性/实质性条款响应/技术评分响应/格式签章/报价与商务/附件材料\",\"status\":\"通过/需修改/高风险/待补\",\"detail\":\"核验说明\"}],\n  "issues": [{\"severity\":\"必须修复/建议确认/提示\",\"category\":\"分类\",\"item\":\"核验项\",\"tenderRequirement\":\"招标要求原文或摘要\",\"bidEvidence\":\"投标文件中对应内容或未找到\",\"problem\":\"发现的问题\",\"suggestion\":\"具体修订建议\",\"location\":\"建议定位章节或页码\"}],\n  "missingMaterials": [{\"material\":\"缺失或待补材料\",\"reason\":\"原因\",\"suggestion\":\"补充建议\"}],\n  "coverage": [{\"requirement\":\"招标技术/评分要求\",\"status\":\"已响应/部分响应/未响应\",\"bidSection\":\"对应投标章节\",\"suggestion\":\"补强建议\"}]\n}\n要求：\n1. 只基于上述招标文件和投标文件核验，不要使用静态示例。\n2. 技术正文可以判断覆盖程度；商务资质、证书、财务、纳税、社保、报价、签章等如果投标文件只保留目录，必须提示“待投标人补充/人工核验”。\n3. 问题清单要可执行，不能只写泛泛建议。\n4. 不要 Markdown，不要解释。`
        }
      ]
    });
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = await parseDeepSeekJson({ apiKey, content, signal: controller.signal });
    return {
      provider: "DeepSeek",
      model: data.model || deepSeekModel,
      verifiedAt: nowIso(),
      bidPageRange: project.bidDocument.bidPageRange || project.bidPageRange || "",
      score: Number(parsed.score || 0),
      overallStatus: parsed.overallStatus || "需修改",
      summary: parsed.summary || "DeepSeek 已完成核验，请查看问题清单。",
      checkedItems: Number(parsed.checkedItems || 0),
      passedCount: Number(parsed.passedCount || 0),
      mustFixCount: Number(parsed.mustFixCount || 0),
      warningCount: Number(parsed.warningCount || 0),
      dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      missingMaterials: Array.isArray(parsed.missingMaterials) ? parsed.missingMaterials : [],
      coverage: Array.isArray(parsed.coverage) ? parsed.coverage : []
    };
  } finally {
    clearTimeout(timeout);
  }
};

const startParsingJob = async (projectId) => {
  setTimeout(() => updateProject(projectId, { status: "parsing", progress: 18, message: "服务端正在提取正文、页码和表格" }), 500);

  setTimeout(async () => {
    const db = await readDb();
    const project = db.projects.find((item) => item.id === projectId);
    if (!project) return;
    project.status = "parsing";
    project.progress = 42;
    project.message = "正文提取完成度校验中";
    await writeDb(db);

    try {
      const extraction = await extractProjectDocument(project);
      const afterExtract = await readDb();
      const extractedProject = afterExtract.projects.find((item) => item.id === projectId);
      if (!extractedProject) return;
      extractedProject.extraction = extraction;
      extractedProject.sourceText = extraction.fullText || extractedProject.sourceText || "";
      extractedProject.progress = 68;
      extractedProject.message = "正在调用 DeepSeek 生成表格化解析报告";
      await writeDb(afterExtract);

      const result = await analyzeWithDeepSeek(extractedProject);
      const latest = await readDb();
      const latestProject = latest.projects.find((item) => item.id === projectId);
      if (!latestProject) return;
      latestProject.status = "completed";
      latestProject.progress = 100;
      latestProject.message = result.raw?.manualReviewRequired ? "解析完成，建议人工复核" : "解析完成";
      if (shouldReplaceProjectName(latestProject, result.parsedProjectName)) {
        latestProject.name = result.parsedProjectName;
      }
      if (latestProject.selectedLot) {
        latestProject.name = lotProjectName(latestProject, latestProject.selectedLot);
      }

      const existing = latest.results.find((item) => item.projectId === projectId);
      if (existing) Object.assign(existing, result);
      else latest.results.unshift(result);
      await writeDb(latest);
    } catch (error) {
      const latest = await readDb();
      const latestProject = latest.projects.find((item) => item.id === projectId);
      if (latestProject) {
        latestProject.status = "failed";
        latestProject.progress = 15;
        latestProject.message = /JSON|array element|position|Unexpected/i.test(error.message || "")
          ? "DeepSeek返回格式异常，请点击重新解析"
          : error.message || "DeepSeek 解析失败";
      }
      await writeDb(latest);
    }
  }, 2200);
};

const activeBidGenerationJobs = new Set();

const startBidGenerationJob = (projectId) => {
  if (activeBidGenerationJobs.has(projectId)) return;
  activeBidGenerationJobs.add(projectId);
  setTimeout(async () => {
    try {
      const db = await readDb();
      const project = db.projects.find((item) => item.id === projectId);
      if (!project) return;
      const result = projectResult(db, project.id);
      const bidDocument = await generateBidWithDeepSeek(project, result, {
        bidPageRange: project.outlineDocument?.bidPageRange || project.bidPageRange,
        onProgress: async ({ done, total, title, percent }) => {
          await updateProject(projectId, {
            bidStatus: "generating",
            bidProgress: percent,
            bidMessage: `正在生成技术章节 ${done}/${total}${title ? `：${title}` : ""}`
          });
        }
      });
      const latest = await readDb();
      const latestProject = latest.projects.find((item) => item.id === project.id);
      if (!latestProject) return;
      latestProject.bidStatus = "generated";
      latestProject.bidProgress = 100;
      latestProject.bidMessage = "DeepSeek 标书生成完成";
      latestProject.bidDocument = bidDocument;
      latestProject.verificationStatus = "not_started";
      latestProject.verificationDocument = null;
      latestProject.verificationMessage = "";
      await writeDb(latest);
    } catch (error) {
      const latest = await readDb();
      const latestProject = latest.projects.find((item) => item.id === projectId);
      if (latestProject) {
        latestProject.bidStatus = "failed";
        latestProject.bidProgress = 0;
        latestProject.bidMessage = error.message || "DeepSeek 生成标书失败";
        await writeDb(latest);
      }
    } finally {
      activeBidGenerationJobs.delete(projectId);
    }
  }, 0);
};

const htmlDoc = (title, body) => `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:'Microsoft YaHei',Arial,sans-serif;line-height:1.8;color:#111827;font-size:14px;">
  <h1>${title}</h1>
  ${body}
</body>
</html>`;

const escHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const tableHtml = (title, headers, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return `<h3>${escHtml(title)}</h3><p>未明确</p>`;
  return `<h3>${escHtml(title)}</h3><table style="width:100%;border-collapse:collapse;margin:8px 0 18px;">
    <thead><tr>${headers.map((header) => `<th style="border:1px solid #d6dbe3;background:#f4f6f8;padding:8px;text-align:left;">${escHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td style="border:1px solid #d6dbe3;padding:8px;vertical-align:top;">${escHtml(row[header] ?? row[headerMap[header]] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
};

const headerMap = {
  项目要素: "item",
  具体内容: "content",
  备注: "remark",
  时间节点: "node",
  具体时间: "time",
  重要提醒: "reminder",
  价格要素: "item",
  具体信息: "info",
  说明: "note",
  注意事项: "note",
  保证金要素: "item",
  具体要求: "requirement",
  审查项目: "item",
  证明材料: "evidence",
  符合性判断: "judgement",
  证照名称: "name",
  是否必需: "required",
  发证机关: "issuer",
  有效期要求: "validity",
  是否需盖章: "sealed",
  获取方式: "source",
  要求项: "item",
  响应要点: "responsePoint",
  风险等级: "riskLevel",
  评分关联: "scoreRelated",
  评分项: "category",
  分值: "score",
  评分说明: "criteria",
  响应策略: "responseStrategy",
  条款: "clause",
  风险: "risk",
  处理建议: "action",
  文件要求: "item",
  资料名称: "material",
  来源: "source"
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

const outlineListHtml = (items, emptyText = "未明确") => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return `<ol><li>${escHtml(emptyText)}</li></ol>`;
  return `<ol>${list
    .map((item) => {
      const model = outlineItemModel(item);
      return `<li>${escHtml(model.label)}${model.children.length ? `<ol>${model.children.map((child) => `<li>${escHtml(child)}</li>`).join("")}</ol>` : ""}</li>`;
    })
    .join("")}</ol>`;
};

const listHtml = (title, items) =>
  `<h3>${escHtml(title)}</h3>${outlineListHtml(items)}`;

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
        parts.push(`<table style="width:100%;border-collapse:collapse;margin:8px 0 16px;"><thead><tr>${head.map((cell) => `<th style="border:1px solid #d6dbe3;background:#f4f6f8;padding:6px;text-align:left;">${escHtml(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td style="border:1px solid #d6dbe3;padding:6px;vertical-align:top;">${escHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      }
    } else {
      parts.push(`<p>${escHtml(line)}</p>`);
    }
  }
  return parts.join("");
};

const bidDocumentHtml = (project, bidDocument) => {
  const doc = bidDocument || {};
  const business = doc.businessDirectory || [];
  const attachments = doc.attachmentDirectory || [];
  const technical = doc.technicalChapters || [];
  return `
    <h1>${escHtml(project.name)}投标文件</h1>
    <p><strong>生成方式：</strong>${escHtml(doc.provider || "DeepSeek")} AI生成技术部分，商务资质材料保留目录待上传。</p>
    <h2>一、商务部分目录</h2>
    <p>以下商务、资质、证照、业绩等材料需由投标人按自身实际资料上传或粘贴，系统不编造资质内容。</p>
    ${outlineListHtml(business, "未生成")}
    <h2>二、技术部分正文</h2>
    ${technical
      .map((chapter, chapterIndex) => {
        const sections = Array.isArray(chapter.sections) ? chapter.sections.filter((section) => section?.heading || section?.content) : [];
        const body = sections.length
          ? sections
              .map((section, sectionIndex) => `<h4>2.${chapterIndex + 1}.${sectionIndex + 1} ${escHtml(section.heading || "章节内容")}</h4>${richTextHtml(section.content)}`)
              .join("")
          : richTextHtml(chapter.content);
        return `<h3>2.${chapterIndex + 1} ${escHtml(chapter.title)}</h3>${body}`;
      })
      .join("") || "<p>未生成技术正文。</p>"}
    <h2>三、附件部分目录</h2>
    ${outlineListHtml(attachments, "未生成")}
  `;
};

const bidDocumentPlainText = (bidDocument) => {
  const doc = bidDocument || {};
  const lines = [];
  lines.push("【商务部分目录】");
  (doc.businessDirectory || []).forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  lines.push("【技术部分正文】");
  (doc.technicalChapters || []).forEach((chapter, index) => {
    lines.push(`2.${index + 1} ${chapter.title || "技术章节"}`);
    const sections = Array.isArray(chapter.sections) ? chapter.sections.filter((section) => section?.heading || section?.content) : [];
    if (sections.length) {
      sections.forEach((section, sectionIndex) => {
        lines.push(`2.${index + 1}.${sectionIndex + 1} ${section.heading || "章节内容"}`);
        lines.push(String(section.content || "").slice(0, 9000));
      });
    } else {
      lines.push(String(chapter.content || "").slice(0, 9000));
    }
  });
  lines.push("【附件部分目录】");
  (doc.attachmentDirectory || []).forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  return lines.join("\n\n");
};

const docxText = (value) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();

const docxParagraph = (text, options = {}) => {
  const { bold, ...paragraphOptions } = options;
  return new Paragraph({
    ...paragraphOptions,
    children: [new TextRun({ text: docxText(text), bold: Boolean(bold) })]
  });
};

const docxBodyParagraphs = (text) => {
  const lines = docxText(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [docxParagraph("本章节内容待补充。")];
  return lines.map((line) => docxParagraph(line, { spacing: { after: 120 }, indent: { firstLine: 420 } }));
};

const docxProjectMeta = (project, result) => {
  const raw = result?.raw || {};
  const info = raw.basicReview?.projectBasicInfo || [];
  const find = (keywords) => {
    const row = info.find((item) => keywords.some((keyword) => String(item.item || item.name || "").includes(keyword)));
    return row?.content || row?.info || row?.requirement || "";
  };
  return {
    projectName: find(["项目名称"]) || project.name || "未命名项目",
    projectNo: find(["项目编号", "招标编号", "采购编号"]) || ""
  };
};

const docxOutlineParagraphs = (items, majorNo) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [docxParagraph(`${majorNo}.1 待补充目录`)];
  const output = [];
  list.forEach((item, index) => {
    const model = outlineItemModel(item);
    output.push(docxParagraph(`${majorNo}.${index + 1} ${model.label}`, { spacing: { after: 80 } }));
    model.children.forEach((child, childIndex) => {
      output.push(docxParagraph(`${majorNo}.${index + 1}.${childIndex + 1} ${child}`, { spacing: { after: 80 }, indent: { left: 420 } }));
    });
  });
  return output;
};

const bidDocxBuffer = async (project, result) => {
  const bidDocument = project.bidDocument || {};
  const meta = docxProjectMeta(project, result);
  const business = bidDocument.businessDirectory || [];
  const attachments = bidDocument.attachmentDirectory || [];
  const technical = Array.isArray(bidDocument.technicalChapters) ? bidDocument.technicalChapters : [];
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 520 },
      children: [new TextRun({ text: "投 标 文 件", bold: true, size: 44 })]
    }),
    docxParagraph(`项目名称：${meta.projectName}`, { spacing: { after: 180 }, bold: true }),
    docxParagraph(`项目编号：${meta.projectNo || "未明确"}`, { spacing: { after: 420 }, bold: true }),
    docxParagraph("目 录", { heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    docxParagraph("一、商务部分目录", { heading: HeadingLevel.HEADING_2 }),
    ...docxOutlineParagraphs(business, 1),
    docxParagraph("二、技术部分", { heading: HeadingLevel.HEADING_2 }),
    ...technical.flatMap((chapter, chapterIndex) => {
      const sections = Array.isArray(chapter.sections) ? chapter.sections.filter((section) => section?.heading || section?.content) : [];
      if (!sections.length) return [docxParagraph(`2.${chapterIndex + 1} ${chapter.title || "技术章节"}`)];
      return [
        docxParagraph(`2.${chapterIndex + 1} ${chapter.title || "技术章节"}`),
        ...sections.map((section, sectionIndex) => docxParagraph(`2.${chapterIndex + 1}.${sectionIndex + 1} ${section.heading || "章节内容"}`, { indent: { left: 420 } }))
      ];
    }),
    docxParagraph("三、附件部分目录", { heading: HeadingLevel.HEADING_2 }),
    ...docxOutlineParagraphs(attachments, 3),
    docxParagraph("一、商务部分目录", { heading: HeadingLevel.HEADING_1 }),
    docxParagraph("商务、资质、证照、业绩、报价等资料需由投标人按真实情况提供，系统仅保留目录，不编造资质内容。", { spacing: { after: 180 } }),
    ...docxOutlineParagraphs(business, 1),
    docxParagraph("二、技术部分", { heading: HeadingLevel.HEADING_1 }),
    ...(technical.length
      ? technical.flatMap((chapter, chapterIndex) => {
          const sections = Array.isArray(chapter.sections) ? chapter.sections.filter((section) => section?.heading || section?.content) : [];
          const paragraphs = [docxParagraph(`2.${chapterIndex + 1} ${chapter.title || "技术章节"}`, { heading: HeadingLevel.HEADING_2 })];
          if (sections.length) {
            sections.forEach((section, sectionIndex) => {
              paragraphs.push(docxParagraph(`2.${chapterIndex + 1}.${sectionIndex + 1} ${section.heading || "章节内容"}`, { heading: HeadingLevel.HEADING_3 }));
              paragraphs.push(...docxBodyParagraphs(section.content));
            });
          } else {
            paragraphs.push(...docxBodyParagraphs(chapter.content));
          }
          return paragraphs;
        })
      : [docxParagraph("技术正文尚未生成。")]),
    docxParagraph("三、附件部分目录", { heading: HeadingLevel.HEADING_1 }),
    docxParagraph("附件材料需由投标人根据自身实际资料补充扫描件、复印件或证明文件。", { spacing: { after: 180 } }),
    ...docxOutlineParagraphs(attachments, 3)
  ];

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun("第 "), new TextRun({ children: [PageNumber.CURRENT] }), new TextRun(" 页")]
      })
    ]
  });

  const doc = new Document({
    sections: [{ properties: {}, footers: { default: footer }, children }]
  });
  return Packer.toBuffer(doc);
};

const verificationReportHtml = (project, verification = {}) => {
  const issues = verification.issues || [];
  const missing = verification.missingMaterials || [];
  const dimensions = verification.dimensions || [];
  return `
    <h2>${escHtml(project.name)}标书核验报告</h2>
    <p><strong>核验方式：</strong>${escHtml(verification.provider || "DeepSeek")} 对照招标文件与投标文件自动核验</p>
    <p><strong>综合通过分：</strong>${escHtml(verification.score ?? "未生成")}</p>
    <p><strong>总体结论：</strong>${escHtml(verification.overallStatus || "待核验")}</p>
    <p><strong>核验摘要：</strong>${escHtml(verification.summary || "暂无")}</p>
    <h3>一、核验维度</h3>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr><th style="border:1px solid #ddd;padding:6px;">维度</th><th style="border:1px solid #ddd;padding:6px;">状态</th><th style="border:1px solid #ddd;padding:6px;">说明</th></tr></thead>
      <tbody>${dimensions
        .map((item) => `<tr><td style="border:1px solid #ddd;padding:6px;">${escHtml(item.name)}</td><td style="border:1px solid #ddd;padding:6px;">${escHtml(item.status)}</td><td style="border:1px solid #ddd;padding:6px;">${escHtml(item.detail)}</td></tr>`)
        .join("")}</tbody>
    </table>
    <h3>二、问题清单</h3>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr><th style="border:1px solid #ddd;padding:6px;">等级</th><th style="border:1px solid #ddd;padding:6px;">分类</th><th style="border:1px solid #ddd;padding:6px;">问题</th><th style="border:1px solid #ddd;padding:6px;">修订建议</th></tr></thead>
      <tbody>${issues
        .map((item) => `<tr><td style="border:1px solid #ddd;padding:6px;">${escHtml(item.severity)}</td><td style="border:1px solid #ddd;padding:6px;">${escHtml(item.category)}</td><td style="border:1px solid #ddd;padding:6px;">${escHtml(item.problem || item.item)}</td><td style="border:1px solid #ddd;padding:6px;">${escHtml(item.suggestion)}</td></tr>`)
        .join("") || '<tr><td colspan="4" style="border:1px solid #ddd;padding:6px;">未发现明确问题</td></tr>'}</tbody>
    </table>
    <h3>三、缺失/待补材料</h3>
    ${outlineListHtml(missing.map((item) => `${item.material || item.item || "材料"}：${item.suggestion || item.reason || "待补充"}`), "未发现")}
  `;
};

const renderAnalysisReport = (project, result) => {
  const raw = result.raw || {};
  const q = result.extractionQuality || raw.extractionQuality || {};
  return `
    <p><strong>项目名称：</strong>${escHtml(project.name)}</p>
    <p><strong>文件名称：</strong>${escHtml(project.fileName)}</p>
    <p><strong>解析模型：</strong>${escHtml(result.model || deepSeekModel)}</p>
    <p><strong>解析摘要：</strong>${escHtml(result.summary)}</p>
    <hr>
    <h2>A.基础审核</h2>
    ${tableHtml("1.项目基本信息表", ["项目要素", "具体内容", "备注"], raw.basicReview?.projectBasicInfo)}
    ${tableHtml("2.关键时间节点表", ["时间节点", "具体时间", "重要提醒"], raw.basicReview?.keyDates)}
    ${tableHtml("3.预算与价格信息表", ["价格要素", "具体信息", "说明"], raw.basicReview?.budgetPricing)}
    ${tableHtml("4.保证金信息表", ["保证金要素", "具体要求", "注意事项"], raw.basicReview?.guaranteeInfo)}
    <h2>B.资格与合规</h2>
    ${tableHtml("1.资格性审查要求表", ["审查项目", "具体要求", "证明材料", "符合性判断"], raw.qualificationCompliance?.qualificationReview)}
    ${tableHtml("2.资质证照清单表", ["证照名称", "是否必需", "发证机关", "有效期要求", "是否需盖章", "获取方式"], raw.qualificationCompliance?.certificateChecklist)}
    <h2>C.商务、技术与评分</h2>
    ${tableHtml("1.商务要求表", ["要求项", "具体要求", "响应要点", "风险等级"], raw.businessReview)}
    ${tableHtml("2.技术要求表", ["要求项", "具体要求", "响应要点", "评分关联"], raw.technicalReview)}
    ${tableHtml("3.评分标准表", ["评分项", "分值", "评分说明", "响应策略"], raw.scoringReview)}
    ${tableHtml("4.废标风险表", ["条款", "风险", "处理建议"], raw.rejectionClauses)}
    <h2>D.文件与大纲</h2>
    ${tableHtml("1.文件格式要求表", ["文件要求", "具体要求", "备注"], raw.submissionFormat)}
    ${tableHtml("2.资料清单表", ["资料名称", "是否必需", "来源", "备注"], raw.materialsChecklist)}
    ${listHtml("3.投标文件大纲-商务部分", raw.bidOutline?.businessPart)}
    ${listHtml("4.投标文件大纲-技术部分", raw.bidOutline?.technicalPart)}
    ${listHtml("5.投标文件大纲-附件部分", raw.bidOutline?.attachmentsPart)}
    <h2>E.提取完整性</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="border:1px solid #d6dbe3;padding:8px;">页数</td><td style="border:1px solid #d6dbe3;padding:8px;">${escHtml(q.pageCount)}</td></tr>
      <tr><td style="border:1px solid #d6dbe3;padding:8px;">字数</td><td style="border:1px solid #d6dbe3;padding:8px;">${escHtml(q.charCount)}</td></tr>
      <tr><td style="border:1px solid #d6dbe3;padding:8px;">表格数</td><td style="border:1px solid #d6dbe3;padding:8px;">${escHtml(q.tableCount)}</td></tr>
      <tr><td style="border:1px solid #d6dbe3;padding:8px;">完整性提示</td><td style="border:1px solid #d6dbe3;padding:8px;">${escHtml((q.warnings || []).join("；") || "无")}</td></tr>
    </table>
  `;
};

const excelDoc = (title, rows) => `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body><table border="1"><caption>${title}</caption>${rows
  .map((row) => `<tr>${row.map((cell) => `<td>${String(cell).replace(/[&<>]/g, "")}</td>`).join("")}</tr>`)
  .join("")}</table></body>
</html>`;

const pdfText = (value) =>
  String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const firstExistingFont = () => [
  "/System/Library/Fonts/Hiragino Sans GB.ttc",
  "/System/Library/Fonts/STHeiti Medium.ttc"
].find((item) => existsSync(item));

const pdfBuffer = (build) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: "解析报告" } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const fontPath = firstExistingFont();
    if (fontPath?.includes("Hiragino Sans GB")) {
      doc.registerFont("CN", fontPath, "HiraginoSansGB-W3");
      doc.font("CN");
    } else if (fontPath) {
      doc.registerFont("CN", fontPath, "STHeitiSC-Medium");
      doc.font("CN");
    }
    build(doc);
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      doc.fontSize(8).fillColor("#64748b").text(`第 ${index + 1} 页 / 共 ${range.count} 页`, 42, 810, { align: "center", width: 511 });
    }
    doc.end();
  });

const renderAnalysisPdf = async (project, result) => {
  const raw = result.raw || {};
  const q = result.extractionQuality || raw.extractionQuality || {};
  const pageBottom = 780;
  const tableBorder = "#d6dbe3";
  const headerBg = "#f1f5f9";
  const titleColor = "#1f4fb2";

  const ensure = (doc, height) => {
    if (doc.y + height > pageBottom) doc.addPage();
  };

  const section = (doc, title) => {
    ensure(doc, 34);
    doc.moveDown(0.6);
    doc.fontSize(15).fillColor(titleColor).text(title, { continued: false });
    doc.moveTo(42, doc.y + 3).lineTo(553, doc.y + 3).strokeColor("#bfdbfe").lineWidth(1).stroke();
    doc.moveDown(0.7);
  };

  const para = (doc, text) => {
    const value = pdfText(text || "未明确");
    ensure(doc, doc.heightOfString(value, { width: 511 }) + 10);
    doc.fontSize(10).fillColor("#111827").text(value, { width: 511, lineGap: 3 });
    doc.moveDown(0.35);
  };

  const table = (doc, title, headers, rows, keys) => {
    section(doc, title);
    const list = Array.isArray(rows) && rows.length ? rows : [{ [keys[0]]: "未明确" }];
    const pageWidth = 511;
    const colWidth = pageWidth / headers.length;
    const widths = headers.map(() => colWidth);

    const drawRow = (cells, isHeader = false) => {
      const padding = 5;
      const heights = cells.map((cell, index) => doc.heightOfString(pdfText(cell) || " ", { width: widths[index] - padding * 2, lineGap: 2 }) + padding * 2);
      const rowHeight = Math.max(24, ...heights);
      ensure(doc, rowHeight + 8);
      const y = doc.y;
      let x = 42;
      cells.forEach((cell, index) => {
        doc.rect(x, y, widths[index], rowHeight).fillAndStroke(isHeader ? headerBg : "#ffffff", tableBorder);
        doc.fillColor(isHeader ? "#334155" : "#111827")
          .fontSize(isHeader ? 9 : 8.5)
          .text(pdfText(cell) || " ", x + padding, y + padding, { width: widths[index] - padding * 2, lineGap: 2 });
        x += widths[index];
      });
      doc.y = y + rowHeight;
    };

    drawRow(headers, true);
    list.forEach((row) => drawRow(keys.map((key) => row?.[key] ?? ""), false));
    doc.moveDown(0.6);
  };

  const list = (doc, title, items) => {
    section(doc, title);
    const values = Array.isArray(items) && items.length ? items : ["未明确"];
    values.forEach((item, index) => {
      const model = outlineItemModel(item);
      para(doc, `${index + 1}. ${model.label}`);
      model.children.forEach((child, childIndex) => para(doc, `   ${index + 1}.${childIndex + 1} ${child}`));
    });
  };

  return pdfBuffer((doc) => {
    doc.fontSize(22).fillColor("#111827").text("招标文件解析报告", { align: "center" });
    doc.moveDown(0.8);
    doc.fontSize(10).fillColor("#475569").text(`项目名称：${project.name}`, { align: "center" });
    doc.text(`文件名称：${project.fileName || "未明确"}    解析模型：${result.model || deepSeekModel}`, { align: "center" });
    doc.moveDown(1.2);

    section(doc, "解析摘要");
    para(doc, result.summary || "AI 已完成招标文件解析，请以原文及人工复核为准。");
    table(doc, "项目基本信息", ["项目要素", "具体内容", "备注"], raw.basicReview?.projectBasicInfo, ["item", "content", "remark"]);
    table(doc, "重要时间节点", ["时间节点", "具体时间", "重要提醒"], raw.basicReview?.keyDates, ["node", "time", "reminder"]);
    table(doc, "预算与价格信息", ["价格要素", "具体信息", "说明"], raw.basicReview?.budgetPricing, ["item", "info", "note"]);
    table(doc, "保证金信息", ["保证金要素", "具体要求", "注意事项"], raw.basicReview?.guaranteeInfo, ["item", "requirement", "note"]);
    table(doc, "资格性审查要求", ["审查项目", "具体要求", "证明材料", "符合性判断"], raw.qualificationCompliance?.qualificationReview, ["item", "requirement", "evidence", "judgement"]);
    table(doc, "商务要求", ["要求项", "具体要求", "响应要点", "风险等级"], raw.businessReview, ["item", "requirement", "responsePoint", "riskLevel"]);
    table(doc, "技术要求", ["要求项", "具体要求", "响应要点", "评分关联"], raw.technicalReview, ["item", "requirement", "responsePoint", "scoreRelated"]);
    table(doc, "评分标准", ["评分项", "分值", "评分说明", "响应策略"], raw.scoringReview, ["category", "score", "criteria", "responseStrategy"]);
    table(doc, "废标风险", ["条款", "风险", "处理建议"], raw.rejectionClauses, ["clause", "risk", "action"]);
    table(doc, "资料清单", ["资料名称", "是否必需", "来源", "备注"], raw.materialsChecklist, ["material", "required", "source", "note"]);
    table(doc, "文件格式要求", ["文件要求", "具体要求", "备注"], raw.submissionFormat, ["item", "requirement", "note"]);
    list(doc, "投标文件大纲 - 商务部分", raw.bidOutline?.businessPart);
    list(doc, "投标文件大纲 - 技术部分", raw.bidOutline?.technicalPart);
    list(doc, "投标文件大纲 - 附件部分", raw.bidOutline?.attachmentsPart);
    table(doc, "提取完整性", ["项目", "结果"], [
      { item: "页数", result: q.pageCount || "未明确" },
      { item: "字数", result: q.charCount || "未明确" },
      { item: "表格数", result: q.tableCount || "未明确" },
      { item: "完整性提示", result: (q.warnings || []).join("；") || "无" }
    ], ["item", "result"]);
  });
};

const downloadPayload = async (kind, project, result) => {
  const base = project.name;
  if (kind === "original") {
    return {
      filename: project.fileName || `${base}.txt`,
      type: "text/plain; charset=utf-8",
      body: `这里是“${base}”的原始招标文件下载占位内容。\n正式系统会返回用户上传的源文件。`
    };
  }
  if (kind === "analysis-doc") {
    return {
      filename: "解析报告.doc",
      type: "application/msword; charset=utf-8",
      body: htmlDoc("深度解析报告", renderAnalysisReport(project, result))
    };
  }
  if (kind === "analysis-xls") {
    const raw = result.raw || {};
    return {
      filename: "解析报告.xls",
      type: "application/vnd.ms-excel; charset=utf-8",
      body: excelDoc("解析报告", [
        ["项目名称", base],
        ["解析项", result.extractedItems],
        ["风险项", result.riskCount],
        ["摘要", result.summary],
        ["项目基本信息", JSON.stringify(raw.basicReview?.projectBasicInfo || [])],
        ["关键时间节点", JSON.stringify(raw.basicReview?.keyDates || [])],
        ["资格审查", JSON.stringify(raw.qualificationCompliance?.qualificationReview || [])],
        ["商务要求", JSON.stringify(raw.businessReview || [])],
        ["技术要求", JSON.stringify(raw.technicalReview || [])],
        ["评分标准", JSON.stringify(raw.scoringReview || [])],
        ["资料清单", JSON.stringify(raw.materialsChecklist || [])],
        ["文件格式", JSON.stringify(raw.submissionFormat || [])],
        ["投标文件大纲", JSON.stringify(raw.bidOutline || {})]
      ])
    };
  }
  if (kind === "analysis-pdf") {
    return { filename: "解析报告.pdf", type: "application/pdf", body: await renderAnalysisPdf(project, result) };
  }
  if (kind === "outline") {
    const outline = result.raw?.bidOutline || {};
    const businessPart = project.outlineDocument?.businessPart || outline.businessPart;
    const technicalPart = project.outlineDocument?.technicalPart || expandTechnicalOutline(result.raw || {}, outline.technicalPart || [], project.bidPageRange || "under_100");
    const attachmentsPart = project.outlineDocument?.attachmentsPart || outline.attachmentsPart;
    return {
      filename: "投标文件大纲.doc",
      type: "application/msword; charset=utf-8",
      body: htmlDoc(
        "投标文件大纲",
        `${listHtml("商务部分", businessPart)}${listHtml("技术部分", technicalPart)}${listHtml("附件部分", attachmentsPart)}`
      )
    };
  }
  if (kind === "bid") {
    return {
      filename: "投标文件.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      body: await bidDocxBuffer(project, result)
    };
  }
  if (kind === "verification") {
    const verification = project.verificationDocument || {};
    return {
      filename: "标书核验报告.doc",
      type: "application/msword; charset=utf-8",
      body: htmlDoc("标书核验报告", verificationReportHtml(project, verification))
    };
  }
  return null;
};

const handleApi = async (req, res, url) => {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      status: "ok",
      service: "AI Bid",
      time: nowIso()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const db = await readDb();
    const account = String(body.account || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const user = db.users.find((item) => item.account.toLowerCase() === account && item.password === password);
    if (!user) {
      sendJson(res, 401, { error: "账号或密码错误" });
      return;
    }
    if (user.enabled === false) {
      sendJson(res, 403, { error: "账号已停用，请联系管理员" });
      return;
    }
    const token = newId("token");
    db.sessions.push({ token, userId: user.id, createdAt: nowIso() });
    await writeDb(db);
    sendJson(res, 200, { token, user: publicUser(user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    const session = await requireSession(req, res, url);
    if (!session) return;
    sendJson(res, 200, { user: publicUser(session.user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    const session = await requireSession(req, res, url);
    if (!session) return;
    const projects = session.db.projects.filter((project) => canReadProject(session.user, project));
    sendJson(res, 200, { projects: projects.map((project) => projectListDto(session.db, project)) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    const session = await requireSession(req, res, url);
    if (!session) return;
    const body = await readBody(req);
    const name = String(body.fileName || "新建招标项目").replace(/\.(pdf|docx?|png|jpe?g)$/i, "");
    const projectId = newId("p");
    const filePath = await saveUploadedFile(projectId, body);
    const project = {
      id: projectId,
      ownerId: session.user.id,
      name,
      fileName: body.fileName || `${name}.pdf`,
      fileSize: Number(body.fileSize || 0),
      filePath,
      uploadTime: nowIso(),
      status: "queued",
      progress: 0,
      message: "队列中，预计等待 30 秒",
      bidStatus: "not_started",
      bidPageRange: "",
      outlineStatus: "not_started",
      outlineDocument: null,
      sourceText: String(body.sourceText || "").slice(0, 120000)
    };
    session.db.projects.unshift(project);
    await writeDb(session.db);
    startParsingJob(project.id);
    sendJson(res, 201, { project: projectDto(session.db, project) });
    return;
  }

  const projectAction = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (projectAction) {
    const [, projectId, action, kind] = projectAction;
    const session = await requireSession(req, res, url);
    if (!session) return;
    const project = session.db.projects.find((item) => item.id === projectId);
    if (!project || !canReadProject(session.user, project)) {
      sendJson(res, 404, { error: "项目不存在" });
      return;
    }

    if (req.method === "GET" && !action) {
      sendJson(res, 200, { project: projectDto(session.db, project) });
      return;
    }

    if (req.method === "POST" && action === "select-lot") {
      const body = await readBody(req);
      const result = projectResult(session.db, project.id);
      const lotOptions = projectLotOptions(session.db, project);
      if (lotOptions.length <= 1) {
        sendJson(res, 400, { error: "当前项目未识别到多个标段" });
        return;
      }
      const selectedLot = lotOptions.find((lot) => lot.id === body.lotId || String(lot.index) === String(body.index));
      if (!selectedLot) {
        sendJson(res, 400, { error: "请选择有效标段" });
        return;
      }
      project.originalName = project.originalName || result.raw?.projectHeader?.projectName || project.name;
      project.lotOptions = lotOptions;
      project.selectedLot = selectedLot;
      project.name = lotProjectName(project, selectedLot);
      project.status = "queued";
      project.progress = 0;
      project.message = `已选择${selectedLot.label}，正在按该标段重新解析`;
      project.bidStatus = "not_started";
      project.bidProgress = 0;
      project.bidMessage = "";
      project.bidDocument = null;
      project.bidPageRange = "";
      project.outlineStatus = "not_started";
      project.outlineMessage = "";
      project.outlineDocument = null;
      project.verificationStatus = "not_started";
      project.verificationMessage = "";
      project.verificationDocument = null;
      await writeDb(session.db);
      startParsingJob(project.id);
      sendJson(res, 200, { project: projectDto(session.db, project), selectedLot });
      return;
    }

    if (req.method === "POST" && action === "reparse") {
      project.status = "queued";
      project.progress = 0;
      project.message = project.selectedLot ? `已选择${project.selectedLot.label}，正在按该标段重新解析` : "队列中，预计等待 30 秒";
      await writeDb(session.db);
      startParsingJob(project.id);
      sendJson(res, 200, { project: projectDto(session.db, project) });
      return;
    }

    if (req.method === "POST" && action === "bid-options") {
      const body = await readBody(req);
      const bidPageRange = bidPageRanges[body.bidPageRange] ? body.bidPageRange : "under_100";
      project.bidPageRange = bidPageRange;
      project.bidStatus = "not_started";
      project.bidDocument = null;
      project.bidMessage = "";
      project.verificationStatus = "not_started";
      project.verificationDocument = null;
      project.verificationMessage = "";
      project.outlineStatus = "not_started";
      project.outlineDocument = null;
      project.outlineMessage = "";
      await writeDb(session.db);
      sendJson(res, 200, { project: projectDto(session.db, project), bidPageRange, label: bidPageRangeMeta(bidPageRange).label });
      return;
    }

    if (req.method === "POST" && action === "generate-outline") {
      const body = await readBody(req);
      if (body.bidPageRange && bidPageRanges[body.bidPageRange]) project.bidPageRange = body.bidPageRange;
      if (project.status !== "completed") {
        sendJson(res, 400, { error: "招标文件尚未解析完成，不能生成目录" });
        return;
      }
      const result = projectResult(session.db, project.id);
      project.outlineStatus = "generating";
      project.outlineMessage = "正在调用 DeepSeek 生成投标文件目录";
      project.outlineDocument = null;
      project.bidStatus = "not_started";
      project.bidDocument = null;
      await writeDb(session.db);
      try {
        const outlineDocument = await generateOutlineWithDeepSeek(project, result, { bidPageRange: project.bidPageRange });
        const latest = await readDb();
        const latestProject = latest.projects.find((item) => item.id === project.id);
        if (!latestProject) {
          sendJson(res, 404, { error: "项目不存在" });
          return;
        }
        latestProject.outlineStatus = "generated";
        latestProject.outlineMessage = "DeepSeek 目录生成完成";
        latestProject.outlineDocument = outlineDocument;
        latestProject.bidStatus = "not_started";
        latestProject.bidDocument = null;
        await writeDb(latest);
        sendJson(res, 200, { project: projectDto(latest, latestProject) });
      } catch (error) {
        const latest = await readDb();
        const latestProject = latest.projects.find((item) => item.id === project.id);
        if (latestProject) {
          latestProject.outlineStatus = "failed";
          latestProject.outlineMessage = error.message || "DeepSeek 生成目录失败";
          await writeDb(latest);
        }
        sendJson(res, 500, { error: error.message || "DeepSeek 生成目录失败" });
      }
      return;
    }

    if (req.method === "POST" && action === "generate-bid") {
      await readBody(req);
      if (project.status !== "completed") {
        sendJson(res, 400, { error: "招标文件尚未解析完成，不能生成标书" });
        return;
      }
      if (!project.outlineDocument?.technicalPart?.length) {
        sendJson(res, 400, { error: "请先在生成目录页按页数档位生成并确认目录，再生成标书内容" });
        return;
      }
      project.bidStatus = "generating";
      project.bidMessage = "DeepSeek 正在按技术目录分章生成标书";
      project.bidProgress = 0;
      project.bidDocument = null;
      project.verificationStatus = "not_started";
      project.verificationDocument = null;
      project.verificationMessage = "";
      await writeDb(session.db);
      startBidGenerationJob(project.id);
      sendJson(res, 202, { project: projectDto(session.db, project) });
      return;
    }

    if (req.method === "POST" && action === "verify") {
      if (project.status !== "completed") {
        sendJson(res, 400, { error: "招标文件尚未解析完成，不能核验标书" });
        return;
      }
      if (!project.bidDocument?.technicalChapters?.length) {
        sendJson(res, 400, { error: "投标文件尚未生成，不能核验" });
        return;
      }
      const result = projectResult(session.db, project.id);
      project.verificationStatus = "verifying";
      project.verificationMessage = "正在调用 DeepSeek 对照招标文件核验标书";
      await writeDb(session.db);
      try {
        const verificationDocument = await generateVerificationWithDeepSeek(project, result);
        const latest = await readDb();
        const latestProject = latest.projects.find((item) => item.id === project.id);
        if (!latestProject) {
          sendJson(res, 404, { error: "项目不存在" });
          return;
        }
        latestProject.verificationStatus = "verified";
        latestProject.verificationMessage = "DeepSeek 核验完成";
        latestProject.verificationDocument = verificationDocument;
        await writeDb(latest);
        sendJson(res, 200, { project: projectDto(latest, latestProject) });
      } catch (error) {
        const latest = await readDb();
        const latestProject = latest.projects.find((item) => item.id === project.id);
        if (latestProject) {
          latestProject.verificationStatus = "failed";
          latestProject.verificationMessage = error.message || "DeepSeek 核验失败";
          await writeDb(latest);
        }
        sendJson(res, 500, { error: error.message || "DeepSeek 核验失败" });
      }
      return;
    }

    if (req.method === "GET" && action === "download" && kind) {
      if (kind === "original" && project.filePath) {
        const originalPath = path.resolve(project.filePath);
        if (originalPath.startsWith(uploadsDir) && existsSync(originalPath)) {
          const body = await readFile(originalPath);
          send(res, 200, body, {
            "Content-Type": mimeTypes[path.extname(project.fileName || originalPath).toLowerCase()] || "application/octet-stream",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(project.fileName || "招标文件")}`
          });
          return;
        }
      }

      const result = projectResult(session.db, project.id);
      const payload = await downloadPayload(kind, project, result);
      if (!payload) {
        sendJson(res, 404, { error: "下载类型不存在" });
        return;
      }
      send(res, 200, payload.body, {
        "Content-Type": payload.type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(payload.filename)}`
      });
      return;
    }
  }

  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    const session = await requireAdmin(req, res, url);
    if (!session) return;
    const projectCount = new Map();
    session.db.projects.forEach((project) => projectCount.set(project.ownerId, (projectCount.get(project.ownerId) || 0) + 1));
    sendJson(res, 200, {
      users: session.db.users.map((user) => ({
        ...publicUser(user),
        projectCount: projectCount.get(user.id) || 0
      }))
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/users") {
    const session = await requireAdmin(req, res, url);
    if (!session) return;
    const body = await readBody(req);
    const account = String(body.account || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const name = String(body.name || "").trim();
    const title = String(body.title || "").trim() || (body.role === "admin" ? "后台管理员" : "标书专员");
    const role = body.role === "admin" ? "admin" : "user";
    if (!/^[a-z0-9_]{3,32}$/.test(account)) {
      sendJson(res, 400, { error: "账号只能使用 3-32 位小写字母、数字或下划线" });
      return;
    }
    if (password.length < 6) {
      sendJson(res, 400, { error: "密码至少 6 位" });
      return;
    }
    if (!name) {
      sendJson(res, 400, { error: "请填写姓名" });
      return;
    }
    if (session.db.users.some((user) => user.account.toLowerCase() === account)) {
      sendJson(res, 409, { error: "账号已存在" });
      return;
    }
    const user = {
      id: newId("u"),
      account,
      password,
      name,
      role,
      title,
      enabled: true,
      createdAt: nowIso()
    };
    session.db.users.push(user);
    await writeDb(session.db);
    sendJson(res, 201, { user: { ...publicUser(user), projectCount: 0 } });
    return;
  }

  const adminUserPasswordAction = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
  if (adminUserPasswordAction && req.method === "POST") {
    const session = await requireAdmin(req, res, url);
    if (!session) return;
    const [, userId] = adminUserPasswordAction;
    const body = await readBody(req);
    const password = String(body.password || "").trim();
    const confirmPassword = String(body.confirmPassword || "").trim();
    const target = session.db.users.find((user) => user.id === userId);
    if (!target) {
      sendJson(res, 404, { error: "账号不存在" });
      return;
    }
    if (password.length < 6) {
      sendJson(res, 400, { error: "密码至少 6 位" });
      return;
    }
    if (password !== confirmPassword) {
      sendJson(res, 400, { error: "两次输入的密码不一致" });
      return;
    }
    target.password = password;
    session.db.sessions = session.db.sessions.filter((item) => item.userId !== target.id || item.token === session.token);
    await writeDb(session.db);
    const projectCount = session.db.projects.filter((project) => project.ownerId === target.id).length;
    sendJson(res, 200, { user: { ...publicUser(target), projectCount } });
    return;
  }

  const adminUserAction = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (adminUserAction && req.method === "POST") {
    const session = await requireAdmin(req, res, url);
    if (!session) return;
    const [, userId] = adminUserAction;
    const body = await readBody(req);
    const target = session.db.users.find((user) => user.id === userId);
    if (!target) {
      sendJson(res, 404, { error: "账号不存在" });
      return;
    }
    if (target.id === session.user.id && body.enabled === false) {
      sendJson(res, 400, { error: "不能停用当前登录的管理员账号" });
      return;
    }
    target.enabled = body.enabled !== false;
    if (!target.enabled) {
      session.db.sessions = session.db.sessions.filter((item) => item.userId !== target.id);
    }
    await writeDb(session.db);
    const projectCount = session.db.projects.filter((project) => project.ownerId === target.id).length;
    sendJson(res, 200, { user: { ...publicUser(target), projectCount } });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/projects") {
    const session = await requireAdmin(req, res, url);
    if (!session) return;
    sendJson(res, 200, { projects: session.db.projects.map((project) => projectListDto(session.db, project)) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/results") {
    const session = await requireAdmin(req, res, url);
    if (!session) return;
    const results = session.db.results
      .map((result) => {
        const project = session.db.projects.find((item) => item.id === result.projectId);
        return { ...result, projectName: project?.name || "未知项目", owner: project ? projectDto(session.db, project).owner : null };
      })
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    sendJson(res, 200, { results });
    return;
  }

  sendJson(res, 404, { error: "接口不存在" });
};

const serveStatic = async (req, res, url) => {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || pathname === projectBasePath) {
    res.writeHead(302, { Location: `${projectBasePath}/` });
    res.end();
    return;
  }
  if (pathname.startsWith(`${projectBasePath}/`)) {
    pathname = pathname.slice(projectBasePath.length);
  }
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(frontendDir, pathname));
  if (!filePath.startsWith(frontendDir)) {
    send(res, 403, "拒绝访问");
    return;
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      send(res, 404, "文件不存在");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    createReadStream(filePath).pipe(res);
  } catch {
    send(res, 404, "文件不存在");
  }
};

await ensureDb();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const requestPath = decodeURIComponent(url.pathname);
  try {
    if (requestPath.startsWith(`${apiBasePath}/`)) {
      const apiUrl = new URL(url);
      apiUrl.pathname = requestPath.slice(projectBasePath.length);
      await handleApi(req, res, apiUrl);
      return;
    }
    if (requestPath.startsWith("/api/")) {
      url.pathname = requestPath;
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "服务器错误" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`AI Bid front：http://localhost:${port}${projectBasePath}/`);
  console.log(`AI Bid admin：http://localhost:${port}${projectBasePath}/admin.html`);
});
