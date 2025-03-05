// Utility functions for the extension

// Format filename according to rules
function formatFileName(name, includeDate = false, format = 'Title - Source - Date') {
  let formattedName = name;

  // Remove random numbers and special characters
  formattedName = formattedName.replace(/[0-9]+/g, '');
  formattedName = formattedName.replace(/[^\w\s-]/g, '');

  // Add date if required
  if (includeDate) {
    const date = new Date().toISOString().split('T')[0];
    formattedName = `${formattedName} (${date})`;
  }

  return formattedName;
}

// Validate API key
async function validateApiKey(apiKey) {
  if (!apiKey) {
    console.error('API key is empty');
    return false;
  }

  // Basic format validation
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(apiKey)) {
    console.error('API key format is invalid');
    return false;
  }

  try {
    console.log('Validating API key...');
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'Test API key validation'
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API validation error:', errorData);
      if (errorData.error?.status === 'UNAUTHENTICATED') {
        console.error('Invalid API key - authentication failed');
        return false;
      }
      if (errorData.error?.status === 'PERMISSION_DENIED') {
        console.error('API key lacks required permissions');
        return false;
      }
      return false;
    }

    const data = await response.json();
    console.log('API validation response:', data);

    // Check for valid response structure
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error('Invalid API response format during validation');
      return false;
    }

    console.log('API key validation successful');
    return true;
  } catch (error) {
    console.error('API validation error:', error);
    return false;
  }
}

// Get file extension
function getFileExtension(filename) {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
}

// Generate a safe filename
function sanitizeFileName(filename) {
  return filename.replace(/[/\\?%*:|"<>]/g, '-');
}

// Export functions for use in popup.js and background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatFileName,
    validateApiKey,
    getFileExtension,
    sanitizeFileName
  };
}