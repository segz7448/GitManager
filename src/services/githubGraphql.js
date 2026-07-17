import { getToken } from './github';

const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';

async function graphqlRequest(query, variables) {
  const token = await getToken();
  if (!token) throw new Error('No GitHub token configured');

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

const BLAME_QUERY = `
  query($owner: String!, $repo: String!, $expression: String!, $path: String!) {
    repository(owner: $owner, name: $repo) {
      object(expression: $expression) {
        ... on Commit {
          blame(path: $path) {
            ranges {
              startingLine
              endingLine
              age
              commit {
                oid
                committedDate
                message
                author {
                  name
                  email
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Line-by-line blame for a file. Returns an array of ranges:
 * [{ startingLine, endingLine, commit: { oid, committedDate, message, author } }]
 * expression is a git ref/branch name, e.g. "main".
 */
export async function getFileBlame(owner, repo, expression, path) {
  const data = await graphqlRequest(BLAME_QUERY, { owner, repo, expression, path });
  const blame = data?.repository?.object?.blame;
  if (!blame) return [];
  return blame.ranges;
}
