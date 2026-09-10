const fs = require('fs');
const path = require('path');

// Root directory for the wiki knowledge base
const BASE_DIR = 'knowledge';

// Define all required subdirectories in the three layers of the architecture
const DIRECTORIES_TO_CREATE = [
    // Layer 1: Raw Sources (Immutable input)
    path.join(BASE_DIR, 'raw/articles'),
    path.join(BASE_DIR, 'raw/papers'),
    path.join(BASE_DIR, 'raw/repos'),
    path.join(BASE_DIR, 'raw/data'),
    path.join(BASE_DIR, 'raw/images'),
    path.join(BASE_DIR, 'raw/assets'),

    // Layer 2: The Wiki (LLM-generated output)
    path.join(BASE_DIR, 'wiki/concepts'),
    path.join(BASE_DIR, 'wiki/entities'),
    path.join(BASE_DIR, 'wiki/sources'),
    path.join(BASE_DIR, 'wiki/comparisons'),

    // Operational outputs and general wiki components
    path.join(BASE_DIR, 'outputs'),
];

/**
 * Creates a directory if it does not already exist.
 * @param {string} dirPath - The full path of the directory to create.
 */
const createDirectory = (dirPath) => {
    try {
        // fs.mkdirSync with recursive option handles all parent directories automatically
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`✅ Created directory: ${path.relative('.', dirPath)}`);
        } else {
            // console.log(`ℹ️ Directory already exists: ${path.relative('.', dirPath)}`); // Suppress redundant messages
        }
    } catch (error) {
        console.error(`❌ Error creating directory ${path.relative('.', dirPath)}:`, error.message);
    }
};

// Main execution function
const scaffoldWikiStructure = () => {
    console.log("--- Starting LLM Wiki Directory Scaffolding ---");
    
    DIRECTORIES_TO_CREATE.forEach(createDirectory);

    console.log("\n=============================================");
    console.log("✨ Scaffolded Directory Structure Complete! ✨");
    console.log(`The knowledge base is set up in the '${BASE_DIR}' folder.`);
    console.log("\nNext steps:");
    console.log("1. Populate raw data into knowledge/raw/");
    console.log("2. Write or create the schema file: knowledge/CLAUDE.md");
    console.log("3. Run the agent to process sources and populate wiki files.");
};

scaffoldWikiStructure();