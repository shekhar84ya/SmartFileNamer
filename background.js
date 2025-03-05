// Initialize settings with defaults
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    apiKey: '',  // Will be set through the popup UI
    autoRename: false,
    includeDate: true,
    namingFormat: 'Title - Source - Date',
    darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches
  });
  console.log('Extension installed - default settings initialized');
});

// Context menu for manual renaming
chrome.contextMenus.create({
  id: 'renameFile',
  title: 'Rename with AI',
  contexts: ['download']
});

// Track renamed files for undo functionality
let renamedFiles = new Map();

// Handle downloads
chrome.downloads.onDeterminingFilename.addListener(async (downloadItem, suggest) => {
  console.log('Processing download:', downloadItem);
  const settings = await chrome.storage.sync.get(['apiKey', 'autoRename']);

  if (!settings.autoRename || !settings.apiKey) {
    console.log('Auto-rename disabled or API key missing');
    return;
  }

  try {
    const newName = await generateFileName(downloadItem);
    if (!newName) {
      throw new Error('Failed to generate a valid filename');
    }
    console.log(`Generated new name for ${downloadItem.filename}:`, newName);
    renamedFiles.set(downloadItem.id, downloadItem.filename);
    suggest({ filename: newName });
  } catch (error) {
    console.error('Error during file renaming:', error);
    // Notify user of error through extension popup
    chrome.runtime.sendMessage({
      type: 'error',
      message: `Failed to rename file: ${error.message}`
    });
  }
});

async function generateFileName(downloadItem) {
  console.log('Generating filename for:', downloadItem.url);
  const settings = await chrome.storage.sync.get(['apiKey', 'includeDate', 'namingFormat']);

  if (!settings.apiKey) {
    throw new Error('API key not configured');
  }

  const prompt = `Suggest a clear, descriptive filename for a file downloaded from ${downloadItem.url} 
    with original name ${downloadItem.filename}. Follow format: ${settings.namingFormat}`;

  try {
    console.log('Sending request to Gemini API...');
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API error:', errorData);
      throw new Error(`API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('Gemini API response:', data);

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid API response format');
    }

    let newName = data.candidates[0].content.parts[0].text.trim();

    // Keep the original extension
    const originalExt = downloadItem.filename.split('.').pop();
    if (!originalExt) {
      throw new Error('Could not determine file extension');
    }

    newName = newName.split('.')[0] + '.' + originalExt;

    if (settings.includeDate) {
      const date = new Date().toISOString().split('T')[0];
      newName = newName.replace('.', ` (${date}).`);
    }

    // Sanitize the filename
    newName = newName.replace(/[/\\?%*:|"<>]/g, '-');

    // Verify the generated filename is valid
    if (!newName || newName.length < 1) {
      throw new Error('Generated filename is invalid');
    }

    return newName;
  } catch (error) {
    console.error('Error in generateFileName:', error);
    throw new Error(`Failed to generate filename: ${error.message}`);
  }
}

// Handle undo requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request);

  if (request.action === 'undo' && request.downloadId) {
    const originalName = renamedFiles.get(request.downloadId);
    if (originalName) {
      console.log(`Undoing rename for download ${request.downloadId} to ${originalName}`);
      chrome.downloads.cancel(request.downloadId, () => {
        chrome.downloads.download({
          url: request.url,
          filename: originalName
        });
      });
      renamedFiles.delete(request.downloadId);
      sendResponse({ success: true });
    } else {
      console.log(`No original name found for download ${request.downloadId}`);
      sendResponse({ success: false, error: 'Original filename not found' });
    }
  }
  return true; // Keep message channel open for async response
});