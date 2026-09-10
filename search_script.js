// search_script.js
/**
 * Web Search Utility Script
 * 
 * IMPORTANT SETUP STEPS:
 * 1. Install a fetch library (e.g., npm install node-fetch@2) or use native Node.js fetch if supported by your version.
 * 2. Get an API Key and a Search Engine ID (SID) from a service like Google CSE, SerpAPI, or Bing Web Search API.
 * 3. Set your credentials in a .env file and load them: e.g., 'API_KEY=your_key'
 */

import axios from 'axios'; // Use axios for easy handling of HTTP requests

// --- CONFIGURATION ---
// NOTE: Replace these with actual values or use environment variables!
const API_KEY = process.env.SEARCH_API_KEY; 
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;
const BASE_URL = 'YOUR_SEARCH_API_ENDPOINT'; // e.g., Google Custom Search API endpoint

/**
 * Performs a search query against the configured web service.
 * @param {string} query - The term or phrase to search for.
 * @returns {Promise<object|null>} A promise that resolves with the structured JSON search results.
 */
async function searchWeb(query) {
    if (!API_KEY || !SEARCH_ENGINE_ID || BASE_URL === 'YOUR_SEARCH_API_ENDPOINT') {
        console.error("🔴 ERROR: API credentials or base URL are not configured.");
        console.error("Please set SEARCH_API_KEY, SEARCH_ENGINE_ID, and update BASE_URL in the script or use a .env file.");
        return null;
    }

    const url = `${BASE_URL}?q=${encodeURIComponent(query)}&key=${API_KEY}&cx=${SEARCH_ENGINE_ID}`;

    console.log(`🔍 Searching for "${query}"...`);

    try {
        // Execute the request using axios (requires 'axios' to be installed)
        const response = await axios.get(url);
        return response.data; // Assuming the API returns JSON data in response.data
    } catch (error) {
        console.error("❌ Failed to perform search:", error.message);
        // Check if it's a specific HTTP error or a connection issue
        if (error.response) {
            return { error: "API Error", message: `Status ${error.response.status}: ${JSON.stringify(error.response.data)}` };
        }
        return null;
    }
}

/**
 * Main execution function to demonstrate usage.
 */
async function main() {
    const searchQuery = process.argv[2] || "What is the best programming language?";

    if (!searchQuery) {
        console.log("Usage: node search_script.js \"your search query here\"");
        return;
    }

    const results = await searchWeb(searchQuery);

    if (results && !results.error) {
        console.log("\n✅ Search Results Retrieved Successfully:");
        // Implement logic here to parse and display the structured data from 'results'
        // For example, printing title, snippet, and link for the first 5 results.
        console.log(JSON.stringify(results, null, 2)); // Outputting raw JSON for inspection
    } else {
        console.log("\n🛑 Search failed or configuration is incorrect.");
    }
}

// Execute the main function
main();