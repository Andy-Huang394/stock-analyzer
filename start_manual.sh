#!/bin/bash
echo "🚀 手动启动模式"
echo ""

# 后端
echo "📦 步骤1: 安装后端依赖..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
echo "✅ 后端依赖安装完成"
echo ""

# 前端
echo "📦 步骤2: 安装前端依赖..."
cd ../frontend
if [ ! -d "node_modules" ]; then
    npm install
fi
echo "✅ 前端依赖安装完成"
echo ""

# 启动
echo "🚀 步骤3: 启动服务..."
echo ""
echo "请打开两个终端窗口分别执行："
echo ""
echo "【终端1 - 后端】"
echo "  cd $(pwd)/../backend"
echo "  source venv/bin/activate"
echo "  python main.py"
echo ""
echo "【终端2 - 前端】"
echo "  cd $(pwd)"
echo "  npm start"
echo ""
echo "然后访问 http://localhost:3000"
