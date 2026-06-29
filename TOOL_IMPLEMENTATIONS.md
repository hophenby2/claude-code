# Claude Code Tool 实现分析

本文档分析当前仓库中内置 tool（如 Read、Write、Edit、Bash、Grep、Glob 等）的定义、注册与执行机制。源码主要位于 `src/tools/**`，公共接口位于 `src/Tool.ts`，工具集合注册位于 `src/tools.ts`。

## 1. 总体架构

### 1.1 Tool 接口

所有 tool 都实现 `Tool` 接口，核心字段和方法包括：

- `name`：模型调用时使用的工具名。
- `inputSchema` / `outputSchema`：基于 Zod 的输入输出结构定义。
- `prompt()`：生成工具说明文本，注入系统提示。
- `description()`：权限确认或 UI 中展示的简短说明。
- `validateInput()`：执行前的输入校验。
- `checkPermissions()`：工具级权限判断。
- `call()`：工具实际执行逻辑。
- `mapToolResultToToolResultBlockParam()`：把内部结果转为 Anthropic API 的 `tool_result`。
- `renderToolUseMessage()` / `renderToolResultMessage()`：终端 UI 渲染。
- `isReadOnly()` / `isConcurrencySafe()` / `isDestructive()`：声明工具行为属性。

参考：`src/Tool.ts:362`、`src/Tool.ts:489`、`src/Tool.ts:500`、`src/Tool.ts:557`、`src/Tool.ts:605`。

### 1.2 buildTool 默认行为

工具通常通过 `buildTool({...})` 创建。`buildTool` 会补齐默认方法：

- `isEnabled` 默认 `true`
- `isConcurrencySafe` 默认 `false`
- `isReadOnly` 默认 `false`
- `isDestructive` 默认 `false`
- `checkPermissions` 默认允许
- `toAutoClassifierInput` 默认空字符串
- `userFacingName` 默认工具名

参考：`src/Tool.ts:703`、`src/Tool.ts:743`、`src/Tool.ts:757`、`src/Tool.ts:783`。

### 1.3 Tool 注册与过滤

工具集合在 `src/tools.ts` 中组装：

- `getAllBaseTools()` 是内置工具的主要注册点。
- `getTools(permissionContext)` 会根据模式和权限过滤可用工具。
- `assembleToolPool()` 合并内置工具与 MCP 工具，并按名称排序、去重。
- `CLAUDE_CODE_SIMPLE` 简化模式下只暴露 Bash、Read、Edit。
- 一些工具受 feature flag、环境变量或用户类型控制。

参考：`src/tools.ts:193`、`src/tools.ts:271`、`src/tools.ts:345`。

默认基础工具包括：

| 工具 | 实现文件 | 说明 |
| --- | --- | --- |
| Agent | `src/tools/AgentTool/AgentTool.tsx` | 启动子 agent / 后台 agent / worktree 隔离 agent |
| TaskOutput | `src/tools/TaskOutputTool/TaskOutputTool.tsx` | 查看后台任务输出 |
| Bash | `src/tools/BashTool/BashTool.tsx` | 执行 shell 命令 |
| Glob | `src/tools/GlobTool/GlobTool.ts` | 按文件名模式搜索文件 |
| Grep | `src/tools/GrepTool/GrepTool.ts` | 基于 ripgrep 搜索文件内容 |
| ExitPlanMode | `src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts` | 退出计划模式 |
| Read | `src/tools/FileReadTool/FileReadTool.ts` | 读取文件、图片、PDF、notebook |
| Edit | `src/tools/FileEditTool/FileEditTool.ts` | 精确字符串替换编辑文件 |
| Write | `src/tools/FileWriteTool/FileWriteTool.ts` | 创建或覆盖文件 |
| NotebookEdit | `src/tools/NotebookEditTool/NotebookEditTool.ts` | 编辑 `.ipynb` 单元格 |
| WebFetch | `src/tools/WebFetchTool/WebFetchTool.ts` | 抓取 URL 并用模型处理内容 |
| TodoWrite | `src/tools/TodoWriteTool/TodoWriteTool.ts` | 旧版 todo 管理 |
| WebSearch | `src/tools/WebSearchTool/WebSearchTool.ts` | 使用服务端 web search |
| TaskStop | `src/tools/TaskStopTool/TaskStopTool.ts` | 停止后台任务 |
| AskUserQuestion | `src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx` | 向用户提问 |
| Skill | `src/tools/SkillTool/SkillTool.ts` | 调用 slash command / skill |
| EnterPlanMode | `src/tools/EnterPlanModeTool/EnterPlanModeTool.ts` | 进入计划模式 |
| Config / Tungsten / LSP / Worktree / Team / Workflow 等 | `src/tools/**` | 条件启用工具 |
| MCP Resource Tools | `ListMcpResourcesTool` / `ReadMcpResourceTool` | MCP 资源枚举与读取 |
| ToolSearch | `src/tools/ToolSearchTool/ToolSearchTool.ts` | 工具按需加载搜索 |

注册参考：`src/tools.ts:193` 到 `src/tools.ts:250`。

## 2. 文件类工具

### 2.1 Read / FileReadTool

实现文件：`src/tools/FileReadTool/FileReadTool.ts`

能力：

- 读取文本文件并加行号。
- 读取图片并返回 base64 image block。
- 读取 Jupyter notebook 并映射为 notebook cell 结果。
- 读取 PDF 或提取 PDF 页面。
- 支持 `offset` / `limit` 分段读取。
- 对重复读取相同范围且文件未变化的情况返回 `file_unchanged` stub，减少上下文浪费。

输入输出：

- 输入包括 `file_path`、`offset`、`limit`、`pages`。
- 输出是 discriminated union：`text`、`image`、`notebook`、`pdf`、`parts`、`file_unchanged`。

关键校验：

- 拒绝普通二进制文件，图片/PDF 例外。
- 阻止会挂起的设备文件，如 `/dev/random`、`/dev/tty`。
- UNC 路径不做提前文件系统访问，避免 Windows NTLM 泄露。
- PDF 页码范围受最大页数限制。
- 读取结果受 token/大小限制。

执行流程：

1. 展开路径并检查权限。
2. 判断是否命中读取去重缓存。
3. 按文件类型进入文本、图片、PDF、notebook 分支。
4. 更新 `readFileState`，为后续 Edit/Write 的“先读后写”和 stale check 提供依据。
5. 映射为模型可见的 `tool_result`，文本结果带行号。

参考：`src/tools/FileReadTool/FileReadTool.ts:338`、`src/tools/FileReadTool/FileReadTool.ts:419`、`src/tools/FileReadTool/FileReadTool.ts:497`、`src/tools/FileReadTool/FileReadTool.ts:653`。

### 2.2 Edit / FileEditTool

实现文件：`src/tools/FileEditTool/FileEditTool.ts`

能力：

- 用 `old_string` / `new_string` 精确替换文件内容。
- 支持 `replace_all`。
- 可在不存在文件且 `old_string === ''` 时创建文件。
- 对 `.ipynb` 拒绝直接编辑，要求使用 NotebookEdit。

关键校验：

- `old_string` 和 `new_string` 不能完全相同。
- 文件必须先通过 Read 完整读取过；partial view 不允许编辑。
- 文件在读取后若被外部修改，会拒绝编辑。
- `old_string` 必须存在；多处匹配时必须 `replace_all: true` 或提供更精确上下文。
- 限制最大可编辑文件大小为 1GiB。
- 对 settings 文件做额外验证。
- 对 team memory 写入进行 secret guard。

执行流程：

1. 展开路径，发现/激活条件 skill。
2. 调用 LSP diagnostic tracker 的编辑前钩子。
3. 创建父目录，必要时记录 file history backup。
4. 重新读取文件并做 stale check。
5. 使用 `findActualString()` 处理引号归一化，再用 `preserveQuoteStyle()` 保留文件中的弯引号风格。
6. 生成 patch，写入文件。
7. 通知 LSP、VS Code，更新 `readFileState`。
8. 返回结构化 patch 和编辑结果。

参考：`src/tools/FileEditTool/FileEditTool.ts:86`、`src/tools/FileEditTool/FileEditTool.ts:137`、`src/tools/FileEditTool/FileEditTool.ts:387`、`src/tools/FileEditTool/FileEditTool.ts:470`。

### 2.3 Write / FileWriteTool

实现文件：`src/tools/FileWriteTool/FileWriteTool.ts`

能力：

- 创建新文件或完整覆盖已有文件。
- 已有文件必须先 Read 过。
- 返回 create/update 类型和 structured patch。

关键校验：

- 写入 team memory 前检查 secret。
- 命中权限 deny rule 时拒绝。
- 已存在文件必须有完整 Read 记录。
- 文件读取后如被外部修改，拒绝覆盖。
- UNC 路径跳过提前文件系统访问。

执行流程：

1. 展开路径，创建父目录。
2. 对已有文件读取当前内容并做 stale check。
3. 用 `writeTextContent()` 写入完整内容，保留指定编码，写入 LF。
4. 通知 LSP 和 VS Code。
5. 更新 `readFileState`。
6. 对更新场景生成 diff patch；新建场景记录所有行作为新增。

参考：`src/tools/FileWriteTool/FileWriteTool.ts:94`、`src/tools/FileWriteTool/FileWriteTool.ts:153`、`src/tools/FileWriteTool/FileWriteTool.ts:223`、`src/tools/FileWriteTool/FileWriteTool.ts:418`。

### 2.4 NotebookEditTool

实现文件：`src/tools/NotebookEditTool/NotebookEditTool.ts`

能力：

- 替换、插入或删除 Jupyter notebook cell。
- 支持通过 `cell_id` 定位 cell。
- 插入时要求指定 `cell_type`。

关键校验：

- 文件必须是 `.ipynb`。
- `edit_mode` 只能是 `replace`、`insert`、`delete`。
- 和 Edit/Write 一样要求 Read-before-Edit，避免 stale view。

参考：`src/tools/NotebookEditTool/NotebookEditTool.ts:90`、`src/tools/NotebookEditTool/NotebookEditTool.ts:176`。

## 3. 搜索类工具

### 3.1 GlobTool

实现文件：`src/tools/GlobTool/GlobTool.ts`

能力：

- 使用内部 `utils/glob` 根据 glob pattern 找文件。
- 默认搜索当前工作目录，也可指定 `path`。
- 返回按相对路径表示的文件列表。
- 默认限制最多 100 个结果，可由 `globLimits` 覆盖。

关键校验：

- `path` 必须存在且是目录。
- UNC 路径跳过提前 stat。
- 权限按 read 权限检查。

参考：`src/tools/GlobTool/GlobTool.ts:57`、`src/tools/GlobTool/GlobTool.ts:94`、`src/tools/GlobTool/GlobTool.ts:154`。

### 3.2 GrepTool

实现文件：`src/tools/GrepTool/GrepTool.ts`

能力：

- 基于 `ripGrep()` 执行内容搜索。
- 支持 `files_with_matches`、`content`、`count` 三种输出模式。
- 支持 `glob`、`type`、`-A`、`-B`、`-C`、`context`、`-n`、`-i`、`multiline`。
- 支持 `head_limit` 和 `offset` 分页。

实现细节：

- 自动排除 `.git`、`.svn`、`.hg` 等 VCS 目录。
- 使用 `--max-columns 500` 避免超长行污染上下文。
- 将绝对路径转相对路径以节省 token。
- `files_with_matches` 模式会按修改时间排序。
- 应用 permission ignore patterns 和 orphaned plugin exclusion。

参考：`src/tools/GrepTool/GrepTool.ts:160`、`src/tools/GrepTool/GrepTool.ts:201`、`src/tools/GrepTool/GrepTool.ts:310`、`src/tools/GrepTool/GrepTool.ts:526`。

## 4. 命令执行工具

### 4.1 BashTool

实现文件：`src/tools/BashTool/BashTool.tsx`

能力：

- 执行 shell 命令。
- 支持超时、后台运行、进度输出、sandbox 标记。
- 大输出可持久化到 tool-results 文件，模型只收到预览和路径。
- 识别图片输出并转成 image block。
- 特殊处理可模拟的 sed in-place edit，使其走文件编辑路径而不是直接运行 sed。

权限与安全：

- `preparePermissionMatcher()` 会解析复合命令，确保 `ls && git push` 这类命令能匹配到 `Bash(git *)` hook/规则。
- `isReadOnly()` 通过命令语义判断是否只读。
- `checkPermissions()` 委托 `bashToolHasPermission()`。
- 对阻塞 sleep 模式做校验，建议后台运行。
- 支持 sandbox 失败注释。

执行流程：

1. 若是模拟 sed 编辑，直接调用文件写入逻辑。
2. 调用 `runShellCommand()` async generator 执行命令。
3. 通过 `onProgress` 发送增量输出。
4. 解释退出码和命令语义；非预期错误抛出 `ShellError`。
5. 处理 cwd reset、sandbox violation、Claude Code hints、图片输出、大输出持久化。
6. 返回 stdout/stderr、是否中断、后台任务 ID、持久化输出路径等。

参考：`src/tools/BashTool/BashTool.tsx:420`、`src/tools/BashTool/BashTool.tsx:445`、`src/tools/BashTool/BashTool.tsx:524`、`src/tools/BashTool/BashTool.tsx:624`、`src/tools/BashTool/BashTool.tsx:826`。

## 5. Agent 与任务类工具

### 5.1 AgentTool

实现文件：`src/tools/AgentTool/AgentTool.tsx`

能力：

- 启动子 agent。
- 支持指定 `subagent_type`、模型、后台运行、名称、team、worktree isolation、cwd override。
- 支持普通 subagent、fork subagent、teammate、remote agent 等不同路径。
- 可根据 agent 定义组装 worker tool pool。

关键逻辑：

- prompt 动态列出可用 agent，并按 MCP requirements 和权限规则过滤。
- 调用时先解析 agent 类型和权限模式。
- 检查 agent 是否被 deny、所需 MCP server 是否可用。
- worktree isolation 会创建 agent 专用 worktree。
- 后台 agent 通过 `registerAsyncAgent()` 注册，并将输出写入任务系统。
- 同步 agent 直接调用 `runAgent()`。

参考：`src/tools/AgentTool/AgentTool.tsx:197`、`src/tools/AgentTool/AgentTool.tsx:240`、`src/tools/AgentTool/AgentTool.tsx:556`、`src/tools/AgentTool/AgentTool.tsx:604`、`src/tools/AgentTool/AgentTool.tsx:687`。

### 5.2 TaskCreate / TaskUpdate / TaskGet / TaskList / TaskStop / TaskOutput

实现目录：`src/tools/Task*Tool/**`

- `TaskCreateTool`：创建任务，触发 task-created hooks，失败时回滚删除任务。
- `TaskUpdateTool`：更新任务状态、字段、依赖、owner、metadata，完成时可触发 hooks。
- `TaskGetTool`：获取单个任务详情。
- `TaskListTool`：列出任务。
- `TaskStopTool`：停止后台任务。
- `TaskOutputTool`：查看后台任务输出，含旧别名 `AgentOutputTool`、`BashOutputTool`。

参考：`src/tools/TaskCreateTool/TaskCreateTool.ts:48`、`src/tools/TaskCreateTool/TaskCreateTool.ts:80`、`src/tools/TaskUpdateTool/TaskUpdateTool.ts:88`、`src/tools/TaskUpdateTool/TaskUpdateTool.ts:123`。

## 6. Web 类工具

### 6.1 WebFetchTool

实现文件：`src/tools/WebFetchTool/WebFetchTool.ts`

能力：

- 抓取 URL，转换成 markdown。
- 对抓取内容应用用户提供的 prompt。
- 预批准 URL 可直接返回 markdown。
- 二进制内容会保存到本地并在结果中提示路径。
- 对跨 host redirect 返回提示，要求模型再次对 redirected URL 调用 WebFetch。

权限：

- 权限粒度按 `domain:hostname`。
- 预批准 host 可自动允许。
- deny / ask / allow rule 都通过 `getRuleByContentsForTool()` 查询。

参考：`src/tools/WebFetchTool/WebFetchTool.ts:66`、`src/tools/WebFetchTool/WebFetchTool.ts:104`、`src/tools/WebFetchTool/WebFetchTool.ts:208`。

### 6.2 WebSearchTool

实现文件：`src/tools/WebSearchTool/WebSearchTool.ts`

能力：

- 通过模型侧 server tool `web_search` 执行搜索。
- 支持 `allowed_domains` / `blocked_domains`。
- 流式解析 search query 和 result，发送 progress。
- 最终结果强制提醒回答中包含 sources。

启用条件：

- firstParty provider 默认启用。
- Vertex 仅 Claude 4 系列支持。
- Foundry 默认支持。
- 其他 provider 默认关闭。

参考：`src/tools/WebSearchTool/WebSearchTool.ts:152`、`src/tools/WebSearchTool/WebSearchTool.ts:168`、`src/tools/WebSearchTool/WebSearchTool.ts:254`、`src/tools/WebSearchTool/WebSearchTool.ts:401`。

## 7. Skill 与交互类工具

### 7.1 SkillTool

实现文件：`src/tools/SkillTool/SkillTool.ts`

能力：

- 执行 slash command / skill。
- 同时支持本地/bundled skill 和 MCP prompt 类型 skill。
- 可把 skill 放入 forked sub-agent 执行，避免主上下文膨胀。
- 会记录 skill 调用 telemetry，并处理 plugin/marketplace 来源信息。

参考：`src/tools/SkillTool/SkillTool.ts:82`、`src/tools/SkillTool/SkillTool.ts:123`。

### 7.2 AskUserQuestionTool

实现文件：`src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx`

用途：

- 在交互式 REPL 中向用户展示选择题。
- 支持单选、多选、预览内容。
- 主要用于需求澄清或实现方案选择。

### 7.3 Plan / Worktree 工具

相关目录：

- `src/tools/EnterPlanModeTool/**`
- `src/tools/ExitPlanModeTool/**`
- `src/tools/EnterWorktreeTool/**`
- `src/tools/ExitWorktreeTool/**`

用途：

- Plan 工具用于进入/退出计划模式。
- Worktree 工具用于创建和退出隔离 git worktree。
- 这些工具通常有严格的 prompt 说明和使用条件。

## 8. MCP 工具

相关文件：

- `src/tools/MCPTool/MCPTool.ts`
- `src/tools/ListMcpResourcesTool/ListMcpResourcesTool.ts`
- `src/tools/ReadMcpResourceTool/ReadMcpResourceTool.ts`
- `src/services/mcp/**`

实现特点：

- MCP server 提供的 tools 会与内置 tools 合并。
- `assembleToolPool()` 会按 deny rules 过滤 MCP tools，并与内置工具去重。
- MCP 资源读取通过独立 resource tools 暴露，不一定作为普通内置工具进入默认列表。

参考：`src/tools.ts:345`。

## 9. 权限、安全与状态机制

### 9.1 权限上下文

`ToolPermissionContext` 包含：

- 当前 permission mode。
- 额外允许目录。
- allow / deny / ask 规则。
- bypass / auto mode 信息。
- 是否避免弹出权限提示。

参考：`src/Tool.ts:123`。

### 9.2 文件 stale check

Read 会写入 `readFileState`；Edit/Write/NotebookEdit 在写入前检查：

- 是否已完整读取。
- 文件 mtime 是否晚于读取时间。
- 如果 mtime 变化但完整内容没变，可允许继续。

这是防止覆盖用户或 formatter/linter 修改的核心机制。

参考：`src/tools/FileReadTool/FileReadTool.ts:503`、`src/tools/FileEditTool/FileEditTool.ts:275`、`src/tools/FileWriteTool/FileWriteTool.ts:198`。

### 9.3 UNC 路径防护

多个文件工具在 Windows UNC 路径下避免提前 `stat/read`，防止访问 `\\server\share` 触发 SMB/NTLM 凭据泄露。

出现位置：Read、Edit、Write、Glob、Grep、NotebookEdit。

### 9.4 结果持久化

Tool 接口中 `maxResultSizeChars` 控制大结果是否持久化到文件。Read 特殊设置为 `Infinity`，因为 Read 自身已经按 token/大小限制输出，且持久化后再 Read 会形成循环。

参考：`src/Tool.ts:456`、`src/tools/FileReadTool/FileReadTool.ts:341`。

## 10. 总结

当前仓库的 tool 系统是一个统一的插件式执行框架：

1. `src/Tool.ts` 定义公共接口与默认行为。
2. 每个 tool 在 `src/tools/<Name>Tool` 下实现 schema、prompt、权限、执行和 UI 渲染。
3. `src/tools.ts` 统一注册、按环境/feature/权限过滤，并与 MCP tools 合并。
4. 文件类工具围绕 `readFileState` 建立强一致的“先读后写”保护。
5. Bash、Agent、WebSearch 等长耗时工具通过 progress、后台任务和结果持久化控制上下文规模。
6. 权限系统贯穿 tool 调用前后，结合 tool-specific matcher、allow/deny/ask rules、hooks 和 sandbox 共同工作。
