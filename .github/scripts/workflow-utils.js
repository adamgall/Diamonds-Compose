const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Download and extract workflow artifact
 * @param {object} github - GitHub API object
 * @param {object} context - GitHub Actions context
 * @param {string} artifactName - Name of the artifact to download
 * @returns {Promise<boolean>} True if artifact was found and extracted
 */
async function downloadArtifact(github, context, artifactName) {
  console.log('Fetching artifacts from workflow run...');
  const artifacts = await github.rest.actions.listWorkflowRunArtifacts({
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: context.payload.workflow_run.id,
  });

  const artifact = artifacts.data.artifacts.find(
    a => a.name === artifactName
  );

  if (!artifact) {
    console.log(`No ${artifactName} artifact found`);
    console.log('Available artifacts:', artifacts.data.artifacts.map(a => a.name).join(', '));
    return false;
  }

  console.log(`Found ${artifactName} artifact, downloading...`);

  const download = await github.rest.actions.downloadArtifact({
    owner: context.repo.owner,
    repo: context.repo.repo,
    artifact_id: artifact.id,
    archive_format: 'zip',
  });

  // Save and extract the artifact
  const artifactPath = path.join(process.env.GITHUB_WORKSPACE, `${artifactName}.zip`);
  fs.writeFileSync(artifactPath, Buffer.from(download.data));

  console.log('Artifact downloaded, extracting...');
  execSync(`unzip -o ${artifactPath} -d ${process.env.GITHUB_WORKSPACE}`);

  return true;
}

/**
 * Parse PR number from data file
 * @param {string} dataFileName - Name of the data file to parse
 * @returns {number|null} PR number or null if not found
 */
function parsePRNumber(dataFileName) {
  const dataPath = path.join(process.env.GITHUB_WORKSPACE, dataFileName);

  if (!fs.existsSync(dataPath)) {
    console.log(`${dataFileName} not found`);
    return null;
  }

  const dataContent = fs.readFileSync(dataPath, 'utf8');
  const prMatch = dataContent.match(/PR_NUMBER=(\d+)/);

  if (!prMatch) {
    console.log(`Could not find PR number in ${dataFileName}`);
    console.log('File contents:', dataContent);
    return null;
  }

  return parseInt(prMatch[1]);
}

/**
 * Read report file
 * @param {string} reportFileName - Name of the report file
 * @returns {string|null} Report content or null if not found
 */
function readReport(reportFileName) {
  const reportPath = path.join(process.env.GITHUB_WORKSPACE, reportFileName);

  if (!fs.existsSync(reportPath)) {
    console.log(`${reportFileName} not found`);
    return null;
  }

  return fs.readFileSync(reportPath, 'utf8');
}

/**
 * Find existing bot comment on PR
 * @param {object} github - GitHub API object
 * @param {object} context - GitHub Actions context
 * @param {number} prNumber - PR number
 * @param {string} commentMarker - Unique string to identify the comment type
 * @returns {Promise<object|null>} Existing comment or null
 */
async function findBotComment(github, context, prNumber, commentMarker) {
  console.log('Checking for existing comments...');
  const { data: comments } = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: prNumber,
  });

  return comments.find(comment =>
    comment.user.type === 'Bot' &&
    comment.body.includes(commentMarker)
  );
}

/**
 * Post or update PR comment
 * @param {object} github - GitHub API object
 * @param {object} context - GitHub Actions context
 * @param {number} prNumber - PR number
 * @param {string} body - Comment body
 * @param {string} commentMarker - Unique string to identify the comment type
 * @param {string} commentType - Type of comment (e.g., 'coverage', 'gas report')
 */
async function postOrUpdateComment(github, context, prNumber, body, commentMarker, commentType) {
  const existingComment = await findBotComment(github, context, prNumber, commentMarker);

  if (existingComment) {
    console.log(`Updating existing ${commentType} comment (ID: ${existingComment.id})...`);
    await github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existingComment.id,
      body: body
    });
    console.log(`${commentType} comment updated successfully!`);
  } else {
    console.log(`Creating new ${commentType} comment...`);
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
      body: body
    });
    console.log(`${commentType} comment posted successfully!`);
  }
}

module.exports = {
  downloadArtifact,
  parsePRNumber,
  readReport,
  postOrUpdateComment
};