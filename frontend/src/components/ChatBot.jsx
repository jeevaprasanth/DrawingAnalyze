import React, { useState, useRef, useEffect } from 'react';
import { FiMessageCircle, FiX, FiSend, FiTrash2, FiClock, FiPlus, FiFileText, FiUpload, FiEdit2, FiCopy, FiCheck, FiX as FiClose } from 'react-icons/fi';
import { sendChatMessage, getChatSessions, getChatSession, createChatSession, saveChatMessage, deleteChatSession, clearAllChatHistory, uploadPDFForChat, getChatPDFContext, deleteChatPDFContext } from '../services/api';

const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [pdfContexts, setPdfContexts] = useState([]);
  const [isUploadingPDF, setIsUploadingPDF] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editText, setEditText] = useState('');
  const [copiedMessage, setCopiedMessage] = useState(null);
  const [copiedBotMessage, setCopiedBotMessage] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Load chat sessions when history panel opens
  const loadSessions = async () => {
    try {
      const response = await getChatSessions();
      if (response.data.success) {
        setSessions(response.data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  // Load PDF context for current session
  const loadPDFContext = async (sessionId) => {
    try {
      const response = await getChatPDFContext(sessionId);
      if (response.data.success) {
        setPdfContexts(response.data.contexts || []);
      }
    } catch (error) {
      console.error('Failed to load PDF context:', error);
    }
  };

  // Open a specific session
  const openSession = async (sessionId) => {
    try {
      const response = await getChatSession(sessionId);
      if (response.data.success) {
        const loadedMessages = response.data.messages.map(msg => ({
          role: msg.role,
          text: msg.content
        }));
        setMessages(loadedMessages);
        setCurrentSessionId(sessionId);
        setShowHistory(false);
        // Load PDF context for this session
        await loadPDFContext(sessionId);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  // Start new chat
  const startNewChat = async () => {
    try {
      const response = await createChatSession('New Chat');
      if (response.data.success) {
        setCurrentSessionId(response.data.sessionId);
        setMessages([]);
        setShowHistory(false);
        setPdfContexts([]);
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  // Handle PDF upload for chat context
  const handlePDFUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentSessionId) return;

    setIsUploadingPDF(true);
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await uploadPDFForChat(currentSessionId, formData);
      if (response.data.success) {
        await loadPDFContext(currentSessionId);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        alert('Failed to upload PDF: ' + response.data.message);
      }
    } catch (error) {
      console.error('PDF upload error:', error);
      alert('Error uploading PDF. Please try again.');
    } finally {
      setIsUploadingPDF(false);
    }
  };

  // Remove PDF context from session
  const handleRemovePDFContext = async (contextId, event) => {
    event.stopPropagation();
    try {
      await deleteChatPDFContext(contextId);
      await loadPDFContext(currentSessionId);
    } catch (error) {
      console.error('Failed to remove PDF context:', error);
    }
  };

  // Edit user message
  const handleEditMessage = async (index) => {
    setEditingMessageIndex(index);
    setEditText(messages[index].text);
  };

  // Save edited message
  const handleSaveEdit = async () => {
    if (editingMessageIndex === null || !editText.trim()) return;

    const updatedMessages = [...messages];
    const oldMessage = updatedMessages[editingMessageIndex].text;
    updatedMessages[editingMessageIndex] = {
      ...updatedMessages[editingMessageIndex],
      text: editText.trim()
    };
    setMessages(updatedMessages);
    setEditingMessageIndex(null);
    setEditText('');

    // Delete old message from backend and send new one
    // Note: We'll just send the new message as a new user message
    // The backend doesn't have edit functionality, so we simulate by:
    // 1. Updating local state
    // 2. Sending the edited message as if it's a new message
    
    setIsLoading(true);
    try {
      // Build conversation history (excluding the edited message)
      const history = updatedMessages
        .filter((msg, idx) => idx !== editingMessageIndex && msg.role === 'user')
        .map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text
        }));

      const response = await sendChatMessage(editText.trim(), history, currentSessionId);
      if (response.success) {
        const botMessage = { role: 'bot', text: response.response };
        setMessages(prev => [...prev, botMessage]);
        await persistMessage('assistant', response.response, response.language || 'en');
      } else {
        setMessages(prev => [...prev, { role: 'bot', text: 'Sorry, I could not generate a response. Please try again.' }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'bot', text: 'Error connecting to the server. Please make sure the backend is running.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Copy message to clipboard
  const handleCopyMessage = async (text, index, isBot = false) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isBot) {
        setCopiedBotMessage(index);
      } else {
        setCopiedMessage(index);
      }
      setTimeout(() => {
        if (isBot) {
          setCopiedBotMessage(null);
        } else {
          setCopiedMessage(null);
        }
      }, 2000);
    } catch (error) {
      console.error('Copy error:', error);
      alert('Failed to copy message');
    }
  };

  // Save message to backend
  const persistMessage = async (role, content, language = 'en') => {
    if (!currentSessionId) return;
    
    try {
      await saveChatMessage(currentSessionId, role, content, language);
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  };

  const handleSend = async () => {
    const inputText = input.trim();
    if (!inputText || isLoading) return;
    
    setInput('');
    
    // Create session if needed
    if (!currentSessionId) {
      try {
        const response = await createChatSession(inputText.substring(0, 40));
        if (response.data.success) {
          setCurrentSessionId(response.data.sessionId);
        }
      } catch (error) {
        console.error('Failed to create session:', error);
        return;
      }
    }
    
    // Add user message
    const userMessage = { role: 'user', text: inputText };
    setMessages(prev => [...prev, userMessage]);
    await persistMessage('user', inputText);
    
    // Show loading indicator
    setIsLoading(true);
    
    try {
      // Build conversation history for context
      const history = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text
      }));
      
      const response = await sendChatMessage(inputText, history, currentSessionId);
      if (response.success) {
        const botMessage = { role: 'bot', text: response.response };
        setMessages(prev => [...prev, botMessage]);
        await persistMessage('assistant', response.response, response.language || 'en');
      } else {
        setMessages(prev => [...prev, { role: 'bot', text: 'Sorry, I could not generate a response. Please try again.' }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'bot', text: 'Error connecting to the server. Please make sure the backend is running.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearCurrentChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
  };

  const handleDeleteSession = async (sessionId, e) => {
    e.stopPropagation();
    try {
      await deleteChatSession(sessionId);
      setSessions(sessions.filter(s => s.session_id !== sessionId));
      if (currentSessionId === sessionId) {
        setMessages([]);
        setCurrentSessionId(null);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const handleClearAllHistory = async () => {
    if (!window.confirm('Are you sure you want to delete all chat history? This cannot be undone.')) {
      return;
    }
    try {
      await clearAllChatHistory();
      setSessions([]);
      setMessages([]);
      setCurrentSessionId(null);
      setShowHistory(false);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  };

  const toggleHistory = async () => {
    const newState = !showHistory;
    setShowHistory(newState);
    if (newState) {
      await loadSessions();
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  return (
    <>
      {/* Chat toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="chatbot-toggle"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, var(--primary-600), var(--primary-500))',
          color: '#fff',
          fontSize: '24px',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(37, 99, 235, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: 'all 0.3s ease'
        }}
        title="Ask Assistant"
      >
        {isOpen ? <FiX /> : <FiMessageCircle />}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div
          className="chatbot-window"
          style={{
            position: 'fixed',
            bottom: '92px',
            right: '24px',
            width: '400px',
            height: '600px',
            background: 'var(--surface-card)',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9998,
            overflow: 'hidden',
            border: '1px solid var(--neutral-200)',
            animation: 'chatbotSlideIn 0.3s ease'
          }}
        >
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, var(--primary-600), var(--primary-500))',
            color: '#fff',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 700
              }}>
                A
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>Assistant</div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>Ask me anything</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={toggleHistory}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s'
                }}
                title="Chat History"
              >
                <FiClock size={12} />
              </button>
              <button
                onClick={startNewChat}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s'
                }}
                title="New Chat"
              >
                <FiPlus size={12} />
              </button>
            </div>
          </div>

          {/* PDF Context Area */}
          {currentSessionId && pdfContexts.length > 0 && !showHistory && (
            <div style={{
              padding: '8px 16px',
              background: 'var(--neutral-50)',
              borderBottom: '1px solid var(--neutral-200)',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              overflowX: 'auto',
              flexShrink: 0
            }}>
              <FiFileText size={14} style={{ color: 'var(--neutral-500)', flexShrink: 0 }} />
              {pdfContexts.map((ctx) => (
                <div
                  key={ctx.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    background: 'var(--primary-50)',
                    border: '1px solid var(--primary-200)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: 'var(--primary-700)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ctx.file_name}
                  </span>
                  <button
                    onClick={(e) => handleRemovePDFContext(ctx.id, e)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--neutral-400)',
                      cursor: 'pointer',
                      padding: '0',
                      display: 'flex',
                      alignItems: 'center',
                      lineHeight: 1
                    }}
                    title="Remove PDF"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Messages area or History panel */}
          <div style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {showHistory ? (
              /* Chat History Panel */
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px'
                }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--neutral-700)' }}>
                    Chat History
                  </div>
                  {sessions.length > 0 && (
                    <button
                      onClick={handleClearAllHistory}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--danger)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontWeight: 500
                      }}
                    >
                      Clear All
                    </button>
                  )}
                </div>
                {sessions.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: 'var(--neutral-400)',
                    fontSize: '13px'
                  }}>
                    No chat history yet. Start a conversation!
                  </div>
                ) : (
                  sessions.map((session) => (
                    <div
                      key={session.session_id}
                      onClick={() => openSession(session.session_id)}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        background: session.session_id === currentSessionId ? 'var(--primary-50)' : 'var(--neutral-50)',
                        border: session.session_id === currentSessionId ? '1px solid var(--primary-200)' : '1px solid var(--neutral-200)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        position: 'relative'
                      }}
                    >
                      <div style={{
                        fontWeight: 500,
                        fontSize: '13px',
                        color: 'var(--neutral-800)',
                        marginBottom: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        paddingRight: '24px'
                      }}>
                        {session.title}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: 'var(--neutral-500)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>{formatDate(session.updated_at)}</span>
                      </div>
                      <button
                        onClick={(e) => handleDeleteSession(session.session_id, e)}
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--neutral-400)',
                          cursor: 'pointer',
                          padding: '2px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="Delete session"
                      >
                        <FiTrash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Messages area */
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                {messages.length === 0 && !isLoading && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    textAlign: 'center',
                    padding: '20px',
                    color: 'var(--neutral-400)'
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'var(--neutral-100)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      marginBottom: '16px',
                      color: 'var(--primary-400)'
                    }}>
                      <FiMessageCircle size={24} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--neutral-600)', marginBottom: '8px' }}>
                      Ask me anything!
                    </div>
                    <div style={{ fontSize: '12px', lineHeight: 1.5 }}>
                      I can help you with the Drawing Analyzer app or answer general questions. Just type your question below!
                    </div>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      maxWidth: '85%',
                      padding: msg.role === 'user' && editingMessageIndex === idx ? '8px' : '10px 14px',
                      borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: msg.role === 'user' ? 'var(--primary-500)' : 'var(--neutral-100)',
                      color: msg.role === 'user' ? '#fff' : 'var(--neutral-800)',
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      fontSize: '13px',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      position: 'relative'
                    }}
                  >
                    {editingMessageIndex === idx ? (
                      <div>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          style={{
                            width: '100%',
                            minHeight: '60px',
                            padding: '6px',
                            border: '1px solid rgba(255,255,255,0.5)',
                            borderRadius: '4px',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            background: 'rgba(255,255,255,0.1)',
                            color: '#fff',
                            resize: 'vertical',
                            marginBottom: '6px'
                          }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => {
                              setEditingMessageIndex(null);
                              setEditText('');
                            }}
                            style={{
                              padding: '4px 10px',
                              background: 'rgba(255,255,255,0.2)',
                              border: 'none',
                              borderRadius: '4px',
                              color: '#fff',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            style={{
                              padding: '4px 10px',
                              background: 'rgba(255,255,255,0.3)',
                              border: 'none',
                              borderRadius: '4px',
                              color: '#fff',
                              fontSize: '11px',
                              cursor: 'pointer',
                              fontWeight: 600
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.text}
                        {msg.role === 'user' && (
                          <div style={{
                            display: 'flex',
                            gap: '4px',
                            marginTop: '4px',
                            justifyContent: 'flex-end'
                          }}>
                            <button
                              onClick={() => handleCopyMessage(msg.text, idx)}
                              style={{
                                background: 'rgba(255,255,255,0.2)',
                                border: 'none',
                                color: '#fff',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                cursor: 'pointer',
                                fontSize: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px'
                              }}
                              title="Copy message"
                            >
                              {copiedMessage === idx ? <FiCheck size={10} /> : <FiCopy size={10} />}
                            </button>
                            <button
                              onClick={() => handleEditMessage(idx)}
                              style={{
                                background: 'rgba(255,255,255,0.2)',
                                border: 'none',
                                color: '#fff',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                cursor: 'pointer',
                                fontSize: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px'
                              }}
                              title="Edit message"
                            >
                              <FiEdit2 size={10} />
                            </button>
                          </div>
                        )}
                        {msg.role === 'bot' && (
                          <div style={{
                            display: 'flex',
                            gap: '4px',
                            marginTop: '4px',
                            justifyContent: 'flex-end'
                          }}>
                            <button
                              onClick={() => handleCopyMessage(msg.text, idx, true)}
                              style={{
                                background: 'rgba(0,0,0,0.1)',
                                border: 'none',
                                color: 'var(--neutral-600)',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                cursor: 'pointer',
                                fontSize: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px'
                              }}
                              title="Copy response"
                            >
                              {copiedBotMessage === idx ? <FiCheck size={10} /> : <FiCopy size={10} />}
                              {copiedBotMessage === idx ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div style={{
                    alignSelf: 'flex-start',
                    padding: '12px 16px',
                    borderRadius: '14px 14px 14px 4px',
                    background: 'var(--neutral-100)',
                    display: 'flex',
                    gap: '4px',
                    alignItems: 'center'
                  }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--neutral-400)',
                      animation: 'chatbotBounce 1.4s ease-in-out infinite'
                    }} />
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--neutral-400)',
                      animation: 'chatbotBounce 1.4s ease-in-out infinite',
                      animationDelay: '0.2s'
                    }} />
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--neutral-400)',
                      animation: 'chatbotBounce 1.4s ease-in-out infinite',
                      animationDelay: '0.4s'
                    }} />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          {!showHistory && (
            <div style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--neutral-200)',
              display: 'flex',
              gap: '8px',
              background: 'var(--surface-card)'
            }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your question..."
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--neutral-200)',
                  fontSize: '13px',
                  outline: 'none',
                  background: 'var(--neutral-50)',
                  color: 'var(--neutral-800)',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--primary-400)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--neutral-200)'; }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  border: 'none',
                  background: input.trim() && !isLoading ? 'var(--primary-500)' : 'var(--neutral-200)',
                  color: '#fff',
                  cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}
              >
                <FiSend size={14} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handlePDFUpload}
                style={{ display: 'none' }}
                disabled={isUploadingPDF || !currentSessionId}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPDF || !currentSessionId}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--neutral-100)',
                  color: 'var(--neutral-600)',
                  cursor: isUploadingPDF || !currentSessionId ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}
                title="Upload PDF for context"
              >
                {isUploadingPDF ? (
                  <div style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid var(--neutral-400)',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                ) : (
                  <FiUpload size={14} />
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Animation styles */}
      <style>{`
        @keyframes chatbotSlideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chatbotBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default ChatBot;
