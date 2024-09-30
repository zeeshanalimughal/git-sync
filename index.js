require("dotenv").config();
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

// GitHub configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const BRANCH_NAME = process.env.BRANCH_NAME || "main";

// Base URL for GitHub API
const GITHUB_API_BASE_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPOSITORY}`;

/**
 * Get the latest commit SHA on the branch
 */
async function getLatestCommitSHA() {
  const url = `${GITHUB_API_BASE_URL}/git/refs/heads/${BRANCH_NAME}`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
    },
  });
  return response.data.object.sha;
}

/**
 * Get the tree SHA of the latest commit
 */
async function getTreeSHA(commitSHA) {
  const url = `${GITHUB_API_BASE_URL}/git/commits/${commitSHA}`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
    },
  });
  return response.data.tree.sha;
}

/**
 * Create a new tree with the files to commit
 */
async function createTree(files, parentTreeSHA) {
  const tree = [];

  for (const file of files) {
    const fileContent = await fs.readFile(file.filePath, "utf8");
    const base64Content = Buffer.from(fileContent).toString("base64");

    tree.push({
      path: file.relativePath,
      mode: "100644",
      type: "blob",
      content: fileContent,
    });
  }

  const url = `${GITHUB_API_BASE_URL}/git/trees`;
  const response = await axios.post(
    url,
    {
      base_tree: parentTreeSHA,
      tree: tree,
    },
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
      },
    }
  );
  return response.data.sha;
}

/**
 * Create a commit with the new tree
 */
async function createCommit(message, treeSHA, parentCommitSHA) {
  const url = `${GITHUB_API_BASE_URL}/git/commits`;
  const response = await axios.post(
    url,
    {
      message: message,
      tree: treeSHA,
      parents: [parentCommitSHA],
    },
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
      },
    }
  );
  return response.data.sha;
}

/**
 * Update the reference of the branch to the new commit
 */
async function updateBranchToCommit(commitSHA) {
  const url = `${GITHUB_API_BASE_URL}/git/refs/heads/${BRANCH_NAME}`;
  await axios.patch(
    url,
    {
      sha: commitSHA,
    },
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
      },
    }
  );
}

/**
 * Read all files in a directory recursively
 * @param {string} dirPath
 * @returns {Promise<Array>} List of file paths
 */
async function readDirectoryRecursive(dirPath) {
  let files = [];

  const items = await fs.readdir(dirPath);

  for (let item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      const innerFiles = await readDirectoryRecursive(fullPath);
      files = files.concat(innerFiles);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Main function to push all files in a directory to GitHub in a single commit
 * @param {string} dirPath - The directory to read
 * @param {string} baseDir - The base directory path for relative paths in GitHub
 */
async function pushDirectoryToGitHub(dirPath, baseDir) {
  try {
    const files = await readDirectoryRecursive(dirPath);

    // Prepare files with their relative paths
    const fileData = files.map((file) => ({
      filePath: file,
      relativePath: path.relative(baseDir, file),
    }));

    const latestCommitSHA = await getLatestCommitSHA();
    const latestTreeSHA = await getTreeSHA(latestCommitSHA);

    // Create a new tree with all files
    const newTreeSHA = await createTree(fileData, latestTreeSHA);

    // Create a commit with the new tree
    const commitMessage = "Update multiple files in a single commit";
    const newCommitSHA = await createCommit(commitMessage, newTreeSHA, latestCommitSHA);

    // Update the branch to point to the new commit
    await updateBranchToCommit(newCommitSHA);

    console.log("All files pushed successfully in a single commit.");
  } catch (error) {
    console.error("Error pushing directory to GitHub:", error.message);
  }
}

// Execute
(async () => {
  const directoryToPush = process.argv[2] || "./code";
  await pushDirectoryToGitHub(directoryToPush, directoryToPush);
})();
