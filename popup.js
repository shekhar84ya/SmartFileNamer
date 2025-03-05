document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const validationStatus = apiKeyInput.parentElement.querySelector('.validation-status');

  function updateValidationStatus(status) {
    validationStatus.className = 'validation-status ' + status;
  }

  function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;

    const container = document.querySelector('.container');
    container.insertBefore(messageDiv, container.firstChild);

    setTimeout(() => messageDiv.remove(), 3000);
  }

  // Load saved settings
  chrome.storage.sync.get([
    'apiKey',
    'autoRename',
    'includeDate',
    'namingFormat',
    'darkMode'
  ], async (settings) => {
    // If API key exists, validate it
    if (settings.apiKey) {
      apiKeyInput.value = settings.apiKey;
      updateValidationStatus('validating');
      try {
        const isValid = await validateApiKey(settings.apiKey);
        updateValidationStatus(isValid ? 'valid' : 'invalid');
        if (!isValid) {
          showMessage('Stored API key is invalid. Please enter a new one.', 'error');
          apiKeyInput.value = '';
        }
      } catch (error) {
        console.error('API key validation error:', error);
        updateValidationStatus('invalid');
        showMessage('Error validating stored API key', 'error');
        apiKeyInput.value = '';
      }
    } else {
      showMessage('Please enter your Gemini API key to start using the extension', 'info');
    }

    // Rest of the settings initialization
    document.getElementById('autoRename').checked = settings.autoRename || false;
    document.getElementById('includeDate').checked = settings.includeDate || true;
    document.getElementById('namingFormat').value = settings.namingFormat || 'Title - Source - Date';

    if (settings.darkMode) {
      document.body.classList.add('dark-mode');
      document.getElementById('toggleTheme').innerHTML = '<i class="fas fa-sun"></i>';
    }
  });

  // API key validation handler
  apiKeyInput.addEventListener('change', async (e) => {
    const apiKey = e.target.value.trim();
    if (!apiKey) {
      showMessage('API key cannot be empty', 'error');
      updateValidationStatus('invalid');
      return;
    }

    updateValidationStatus('validating');
    try {
      const isValid = await validateApiKey(apiKey);
      updateValidationStatus(isValid ? 'valid' : 'invalid');

      if (isValid) {
        chrome.storage.sync.set({ apiKey });
        showMessage('API key validated and saved successfully', 'success');
      } else {
        showMessage('Invalid API key. Please check and try again', 'error');
        e.target.value = '';
      }
    } catch (error) {
      console.error('API key validation error:', error);
      updateValidationStatus('invalid');
      showMessage('Error validating API key. Please try again', 'error');
      e.target.value = '';
    }
  });

  document.getElementById('autoRename').addEventListener('change', (e) => {
    chrome.storage.sync.set({ autoRename: e.target.checked });
    showMessage('Auto-rename setting updated', 'success');
  });

  document.getElementById('includeDate').addEventListener('change', (e) => {
    chrome.storage.sync.set({ includeDate: e.target.checked });
    showMessage('Date inclusion setting updated', 'success');
  });

  document.getElementById('namingFormat').addEventListener('change', (e) => {
    chrome.storage.sync.set({ namingFormat: e.target.value });
    showMessage('Naming format updated', 'success');
  });

  // Theme toggle
  document.getElementById('toggleTheme').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    chrome.storage.sync.set({ darkMode: isDark });
    document.getElementById('toggleTheme').innerHTML = isDark ? 
      '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  });

  // Load recent history
  loadHistory();

  // Listen for error messages from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'error') {
      showMessage(message.message, 'error');
    }
  });
});

async function loadHistory() {
  try {
    const historyList = document.getElementById('historyList');
    const downloads = await chrome.downloads.search({limit: 5});

    historyList.innerHTML = downloads.map(download => `
      <div class="history-item">
        <span class="filename" title="${download.filename}">${download.filename}</span>
        <button class="undo-btn" data-id="${download.id}" data-url="${download.url}">
          <i class="fas fa-undo"></i>
        </button>
      </div>
    `).join('');

    // Add undo functionality
    document.querySelectorAll('.undo-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const downloadId = parseInt(e.currentTarget.dataset.id);
        const url = e.currentTarget.dataset.url;

        try {
          const response = await new Promise(resolve => {
            chrome.runtime.sendMessage({
              action: 'undo',
              downloadId: downloadId,
              url: url
            }, resolve);
          });

          if (response.success) {
            showMessage('File name restored successfully', 'success');
            loadHistory(); // Refresh the history
          } else {
            showMessage(response.error || 'Failed to restore original name', 'error');
          }
        } catch (error) {
          console.error('Undo error:', error);
          showMessage('Error restoring original name', 'error');
        }
      });
    });
  } catch (error) {
    console.error('Error loading history:', error);
    showMessage('Failed to load download history', 'error');
  }
}