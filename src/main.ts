import * as core from '@actions/core'
import * as github from "@actions/github";

async function run(): Promise<void> {
    try {
        const inputs = {
            token: core.getInput("token"),
            branch: core.getInput("branch"),
            workflow: core.getInput("workflow"),
            verify: core.getInput('verify')
        };

        const octokit = github.getOctokit(inputs.token);
        const repository: string = process.env.GITHUB_REPOSITORY as string;
        const [owner, repo] = repository.split("/");
        
        core.info(`owner: ${owner}`);
        core.info(`repo: ${repo}`);
        core.info(`branch: ${inputs.branch}`);
        core.info(`workflow: ${inputs.workflow}`);
        core.info(`verify: ${inputs.verify}`);

        const workflows = await octokit.actions.listRepoWorkflows({ owner, repo });
        core.info(`workflows: ${JSON.stringify(workflows)}`);
        const workflowId = workflows.data.workflows.find(w => w.name === inputs.workflow)?.id;
        core.info(`workflowId: ${workflowId}`);

        if (!workflowId) {
            core.setFailed(`No workflow exists with the name "${inputs.workflow}"`);
            return;
        } else {
            core.info(`Discovered workflowId for search: ${workflowId}`);
        }

        const response = await octokit.actions.listWorkflowRuns({ owner, repo, workflow_id: workflowId, per_page: 500 });
        core.info(`response: ${JSON.stringify(response)}`);

        const runs = response.data.workflow_runs
            .filter(x => (!inputs.branch || x.head_branch === inputs.branch) && x.conclusion === "success")
            .sort((r1, r2) => new Date(r2.created_at).getTime() - new Date(r1.created_at).getTime());

        core.info(`Found ${runs.length} successful runs`);
        
        let triggeringSha = process.env.GITHUB_SHA as string;
        let sha: string | undefined = undefined;
        
        if (runs.length > 0) {
            for (const run of runs) {
                core.info(`This SHA: ${triggeringSha}`);
                core.info(`Run SHA: ${run.head_sha}`);
                core.info(`Run Branch: ${run.head_branch}`);
                core.info(`Wanted branch: ${inputs.branch}`);

                if (triggeringSha != run.head_sha && (!inputs.branch || run.head_branch === inputs.branch)) {
                    core.info(
                      inputs.verify
                      ? `Commit ${run.head_sha} from run ${run.html_url} verified as last successful CI run.`
                      : `Using ${run.head_sha} from run ${run.html_url} as last successful CI run.`
                    );
                    sha = run.head_sha;
                    break;
                }
            }
        } else {
            core.info(`No previous runs found for branch ${inputs.branch}.`);
        }

        if (!sha) {
            core.warning("Unable to determine SHA of last successful commit. Using SHA for current commit.");
            sha = triggeringSha;
        }

        core.setOutput('sha', sha);
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
