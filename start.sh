#!/bin/bash

# Stock Analyzer 启动脚本
# 贾维斯出品 🎩

set -e

echo "🚀 Stock Analyzer 启动中..."
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查Python
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ 错误: 未找到 Python"
    exit 1
fi

echo -e "${BLUE}📦 检查依赖...${NC}"
echo "使用 Python: $PYTHON_CMD"

# 安装后端依赖
if [ ! -d "backend/venv" ]; then
    echo "创建虚拟环境..."
    $PYTHON_CMD -m venv backend/venv
fi

source backend/venv/bin/activate
pip install -q -r backend/requirements.txt

echo -e "${GREEN}✅ 后端依赖安装完成${NC}"

# 安装前端依赖
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}⏳ 安装前端依赖（首次运行可能需要几分钟）...${NC}"
    cd frontend
    npm install
    cd ..
fi

echo -e "${GREEN}✅ 前端依赖安装完成${NC}"

# 启动后端
echo ""
echo -e "${BLUE}🚀 启动后端服务...${NC}"
cd backend
source venv/bin/activate
python main.py &
cd ..

# 等待后端启动
sleep 3

# 启动前端
echo ""
echo -e "${BLUE}🚀 启动前端应用...${NC}"
cd frontend
npm start &
cd ..

echo ""
echo -e "${GREEN}✅ Stock Analyzer 启动成功！${NC}"
echo ""
echo "📊 应用访问地址:"
echo "   前端界面: http://localhost:3000"
echo "   API文档:  http://localhost:8000/docs"
echo ""
echo -e "${YELLOW}按 Ctrl+C 停止服务${NC}"

# 等待所有后台进程
wait
