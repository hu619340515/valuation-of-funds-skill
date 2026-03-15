---
name: fund-portfolio-visualizer
description: 基金池实时估值可视化工具。获取基金实时估值数据，生成美观的图片报告并推送到飞书。当用户需要查询基金估值、生成基金持仓可视化图表、定时推送基金报告时使用。支持自定义基金代码列表、自动计算平均涨跌幅、使用 Playwright 生成高质量 PNG 图片。
---

# Fund Portfolio Visualizer

基金池实时估值可视化工具，生成美观的图片报告并推送到飞书。

## 功能

1. **实时数据获取** - 从天天基金网获取基金实时估值数据
2. **图片生成** - 使用 Playwright 生成美观的 PNG 报告
3. **飞书推送** - 自动将图片推送到指定飞书群
4. **自定义配置** - 支持自定义基金代码列表

## 使用方法

### 直接生成图片

```bash
node scripts/fund_image_playwright.js
```

生成的图片保存在 `screenshots/fund_report_YYYY-MM-DDTHH-MM-SS.png`

### 生成并推送到飞书

```bash
./scripts/fund_push_image_v2.sh
```

### 定时任务配置

添加到 crontab：

```bash
# 交易日 11:50 推送
50 11 * * 1-5 /path/to/scripts/fund_push_image_v2.sh

# 交易日 14:50 推送
50 14 * * 1-5 /path/to/scripts/fund_push_image_v2.sh
```

## 配置文件

修改脚本中的基金代码列表：

```javascript
// fund_image_playwright.js
const FUNDS = [
  "013273", "004070", "024618", "007883", "013172",
  "006195", "024003", "021458", "012414", "018561"
];
```

## 依赖

- Node.js
- Playwright (系统已有)
- OpenClaw CLI (用于飞书推送)

## 输出示例

- 图片尺寸：700 x (100 + 80*n) 像素
- 包含：标题、时间、基金列表、平均涨跌幅
- 涨跌颜色：红色涨、绿色跌

## 故障排除

1. **Playwright 未找到浏览器** - 确保已安装 Chromium
2. **飞书推送失败** - 检查 OPENCLAW_GATEWAY_TOKEN 环境变量
3. **基金数据获取失败** - 检查网络连接，API 可能有频率限制
