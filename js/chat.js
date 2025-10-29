// 聊天页面初始化
function initChatPage() {
    const roomId = sessionStorage.getItem('currentRoom');
    const roomName = sessionStorage.getItem('roomName');
    
    if (!roomId) {
        alert('未选择聊天室');
        goBack();
        return;
    }
    
    // 设置页面标题
    document.getElementById('roomTitle').textContent = roomName;
    
    // 加入聊天室
    chatManager.joinRoom(roomId, roomName);
    
    // 加载历史消息
    chatManager.loadHistoryMessages();
    
    // 设置输入框焦点
    document.getElementById('messageInput').focus();
}

// 返回聊天室列表
function goBack() {
    window.location.href = 'index.html';
}

// 发送消息
function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if (content) {
        chatManager.sendMessage(content);
        input.value = '';
    }
    
    // 重新聚焦输入框
    input.focus();
}

// 处理键盘事件（按Enter发送）
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// 页面加载完成后初始化聊天页面
document.addEventListener('DOMContentLoaded', initChatPage);