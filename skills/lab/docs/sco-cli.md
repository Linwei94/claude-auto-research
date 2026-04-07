# SCO CLI 参考文档

SCO CLI（SenseCore Command Line Interface）是商汤大装置平台的命令行工具，用于提交和管理 C500 训练任务。

---

## 安装与初始化

### 安装（Linux/macOS）

```bash
curl -sSfL https://sco.sensecore.cn/registry/sco/install.sh | sh && export PATH=~/.sco/bin:$PATH
```

安装成功后会打印版本信息：

```
SenseCore Command Line Interface:
Version:          v1.0.1-dev.34.gf8dc37c
Go Version:       go version go1.21.1 linux/amd64
```

**非交互式 SSH 环境（如 exec agent）**：`.bashrc` 中的 `export PATH` 在非交互式 SSH 中不生效，必须用全路径：

```bash
# 推荐写法：每条 SSH 命令都显式加 PATH
ssh finn_cci_c500 "PATH=~/.sco/bin:\$PATH sco acp jobs list ..."

# 或直接用全路径
ssh finn_cci_c500 "~/.sco/bin/sco acp jobs list ..."
```

### 安装全部组件（必须，否则 `sco acp` 子命令不可用）

```bash
sco components install all
```

### 初始化（配置 AccessKey）

```bash
sco init
```

`sco init` 会交互式配置：AccessKey ID、AccessKey Secret、可用区。

配置存储在 `~/.config/sco/`。

---

## 常见故障恢复

| 现象 | 原因 | 修复 |
|------|------|------|
| `sco: command not found` | PATH 未设置或未安装 | 重装：`curl -sSfL https://sco.sensecore.cn/registry/sco/install.sh \| sh` |
| `sco acp: unknown command` | `acp` 组件未安装 | `sco components install all` |
| `authentication failed` / `401` | AccessKey 过期或未配置 | `sco init` 重新配置 |
| 版本不匹配报错 | 旧版本 | `sco components upgrade` |
| SSH 环境中命令找不到 | `.bashrc` 在非交互式 SSH 中不加载 | 用全路径 `~/.sco/bin/sco ...` 或 `PATH=~/.sco/bin:$PATH sco ...` |

**在 `finn_cci_c500` 上完整重装流程：**

```bash
# 1. 重装 sco
ssh finn_cci_c500 "curl -sSfL https://sco.sensecore.cn/registry/sco/install.sh | sh"

# 2. 安装所有组件
ssh finn_cci_c500 "~/.sco/bin/sco components install all"

# 3. 重新初始化（如果 AccessKey 丢失）
ssh finn_cci_c500 "~/.sco/bin/sco init"

# 4. 验证
ssh finn_cci_c500 "~/.sco/bin/sco version"
```

---

## 配置管理

### 查看当前配置

```bash
sco config list
```

输出示例：
```
access_key_id = '6DF253F796E24CBF99FF16F678F85627'
access_key_secret = '******'
username = 'user1'
zone = 'cn-sh-01a'

Your active profile is: [default]
```

### 多 Profile 管理

```bash
sco config profiles list                    # 列出所有 profile
sco config profiles create [NAME]           # 创建新 profile（自动激活）
sco config profiles activate [NAME]         # 切换激活的 profile
sco config profiles describe [NAME]         # 查看某个 profile 的属性
sco config profiles delete [NAME]           # 删除 profile（不能删除当前激活的）
```

运行单条命令时临时切换 profile：

```bash
sco acp jobs list --workspace-name=... --profile [PROFILE_NAME]
```

### 设置/取消配置属性

```bash
sco config set subscription [SUBSCRIPTION_NAME]
sco config unset subscription

# 设置非 core 部分的属性（格式：部分.属性）
sco config set aec2.subscription [SUBSCRIPTION_NAME]
```

---

## 组件管理

```bash
sco components list              # 查看可用/已安装的组件
sco components install [NAME]    # 安装指定组件
sco components install all       # 安装所有组件
sco components upgrade           # 升级所有已安装组件到最新版
sco components update            # 更新组件列表（不升级）
sco components remove [NAME]     # 移除组件
```

---

## ACP 训练任务管理（`sco acp jobs`）

### 创建任务

```bash
sco acp jobs create \
  --workspace-name=<WORKSPACE_NAME> \
  --aec2-name=<AEC2_NAME> \
  --job-name=<JOB_NAME> \
  --container-image-url='<IMAGE_URI>' \
  --training-framework=pytorch \
  --worker-nodes=<NUM> \
  --worker-spec='<SPEC>' \
  --command='<COMMAND>' \
  [--priority=NORMAL|HIGH|HIGHEST] \
  [--env=[KEY1:VAL1,KEY2:VAL2]] \
  [--storage-mount=[VOLUME_ID:PATH,...]] \
  [--enable-fault-tolerance] \
  [--retry-times=<N>]
```

**必要参数说明：**

| 参数 | 说明 |
|------|------|
| `--workspace-name` | Workspace 名称 |
| `--aec2-name` | AEC2 集群名；公共集群填 `public` |
| `--job-name` | 任务显示名称 |
| `--container-image-url` | Docker 镜像 URI |
| `--training-framework` | `pytorch` / `tensorflow` / `mpi` / `senseparrots` |
| `--worker-nodes` | 节点数量 |
| `--worker-spec` | 节点规格（多个以 `,` 分隔） |
| `--command` | 运行命令（多行以 `;` 分隔） |

**示例：**

```bash
sco acp jobs create \
  --workspace-name=aceworld-base \
  --aec2-name=public \
  --job-name=exp1-cifar10c \
  --container-image-url='registry.sensetime.com/lepton/metax_pt:latest' \
  --training-framework=pytorch \
  --worker-nodes=1 \
  --worker-spec='MetaX.vGPU=1' \
  --command='cd /mnt/afs/lixiaoou/intern/linweitao/myproject && conda run -n myenv python train.py' \
  --env=[WANDB_API_KEY:xxxx]
```

提取 job_id（`sco acp jobs create` 输出中）：

```bash
JOB_OUTPUT=$(ssh finn_cci_c500 "PATH=~/.sco/bin:\$PATH sco acp jobs create ... 2>&1")
JOB_ID=$(echo "$JOB_OUTPUT" | grep -oE 'pt-[a-z0-9]+' | head -1)
```

### 列出任务

```bash
sco acp jobs list \
  --workspace-name=<WORKSPACE_NAME> \
  [--page-size=10] [--page-token=1] \
  [--state=RUNNING|FAILED|SUCCEEDED|...] \
  [--name=<prefix>] \
  [--display-name=<prefix>] \
  [--created-after=2025-06-01T00:00:00+08:00] \
  [--created-before=2025-12-01T00:00:00+08:00]
```

**常用状态值：** `WAITING` / `QUEUEING` / `STARTING` / `RUNNING` / `SUCCEEDED` / `FAILED` / `SUSPENDED` / `DELETED`

**注意：**
- 时间范围必须同时提供 `--created-after` 和 `--created-before`，单独传 `--created-before` 可能被后端拒绝
- `--uid` 是唯一标识符，提供后无需组合其他过滤条件

### 查询任务详情

```bash
sco acp jobs describe --workspace-name=<WORKSPACE_NAME> [--format=json|yaml|xml] <JOB_ID>
```

### 查看实时日志

```bash
sco acp jobs stream-logs \
  --workspace-name=<WORKSPACE_NAME> \
  [--worker-name=master-0] \
  [--follow] \
  <JOB_ID>
```

### 停止 / 启动 / 删除任务

```bash
sco acp jobs stop   --workspace-name=<WORKSPACE_NAME> <JOB_ID> [<JOB_ID2> ...]
sco acp jobs start  --workspace-name=<WORKSPACE_NAME> <JOB_ID> [<JOB_ID2> ...]
sco acp jobs delete --workspace-name=<WORKSPACE_NAME> <JOB_ID> [<JOB_ID2> ...]
```

### 复制任务（基于已有任务创建新任务）

```bash
sco acp jobs copy \
  --workspace-name=<WORKSPACE_NAME> \
  --copy-job-name=<EXISTING_JOB_NAME> \
  --job-name=<NEW_JOB_NAME>
```

### 登录运行中的任务容器

```bash
sco acp jobs exec \
  --workspace-name=<WORKSPACE_NAME> \
  --worker-name=<WORKER_NAME> \
  <JOB_ID>
```

---

## 在 exec_c500.md 中的使用约定

exec agent 通过 SSH 到 `finn_cci_c500` 运行 sco 命令。统一用以下写法避免 PATH 问题：

```bash
ssh finn_cci_c500 "PATH=~/.sco/bin:\$PATH sco acp jobs create --workspace-name=aceworld-base ..."
```

Workspace name 固定为 `aceworld-base`（从 config.md 读取，字段 `c500_workspace`）。
