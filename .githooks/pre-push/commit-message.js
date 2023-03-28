#!/usr/bin/env node

'use strict';

const chalk = require('chalk');
const { execFileSync } = require('child_process');
const tty = require('tty');
const fs = require('fs');
const readline = require('readline');
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false,
});

// Note: Reading interactive input explicitly from TTY instead of STDIN because
//       this hook can be passed ref information via STDIN, which attaches STDIN
//       to the piped input stream rather than to the terminal, but we want the
//       latter.
const ttyPrompt = readline.createInterface({
	input: new tty.ReadStream(fs.openSync('/dev/tty', 'r')),
	output: process.stdout,
	terminal: true,
});

// Define a custom error type
function CustomError(message) {
	this.message = message;
}
CustomError.prototype = Object.create(Error.prototype);
CustomError.prototype.name = 'CustomError';
CustomError.prototype.constructor = CustomError;

const EMPTY_COMMIT_HASH = '0000000000000000000000000000000000000000';

const SUBJECT_VERB_EXCEPTIONS = [
	'exceed',
	'embed',
	'feed',
	'proceed',
	'seed',
	'shed',
	'shred',
	'speed',
	'succeed',
	'weed',
];

const ISSUE_TRACKER_TICKET_PATTERN_STRING =
	'(?:(?:[a-zA-Z0-9_\\-]+\\/)?[a-zA-Z0-9_\\-]+)?\\#[0-9]+';
const VALID_ISSUE_TRACKER_TICKET_TAGS = [
	'Fixes',
	'Resolves',
	'Implements',
	'Related',
	'See also',
];
const VALID_METADATA_TAGS = [...VALID_ISSUE_TRACKER_TICKET_TAGS];

const MESSAGE = {
	SUBJECT_LONG:
		'The subject is long (more than 50 characters). Consider making it more concise.',
	SUBJECT_TOO_LONG:
		'The subject is too long (more than 69 characters). Make it more concise, or move the explanatory text to the commit body.',
	SUBJECT_TRAILING_PUNCTUATION:
		'The subject should not have any trailing punctuation.',
	SUBJECT_INVALID:
		'The subject is invalid. Make sure to capitalize the message.',
	SUBJECT_GRAMMAR:
		'The subject seems to be grammatically incorrect. Make sure the first word is a verb in the infinitive/imperative form.',
	BODY_OMITTED:
		'The commit body was omitted. Consider adding a commit body to give context to the commit.',
	BODY_SUBJECT_SEPARATION:
		'The commit subject and body should be separated by one blank line.',
	BODY_METADATA_SEPARATION:
		'The commit body and metadata should be separated by one blank line.',
	BODY_TOO_LONG:
		'The lines of the commit body are too long (more than 72 characters).',
	METADATA_OMITTED:
		'The metadata were omitted. Consider adding some (e.g., an issue tracker ticket) to help track the commit.',
	METADATA_INVALID: `The metadata tags are in an invalid format; they should be capitalized, followed by colons, and be one of these:\n    ${VALID_METADATA_TAGS.join(
		', '
	)}`,
	METADATA_TICKET_FORMAT:
		'One of the issue tracker tickets is improperly formatted.',
};

const refLines = [];
let warningsDetected = false;
let errorsDetected = false;
const problems = {};

function checkSubject(commit, subject) {
	// Length checks
	if (subject.length > 69) {
		problems[commit].errors.push('SUBJECT_TOO_LONG');
	} else if (subject.length > 50) {
		problems[commit].warnings.push('SUBJECT_LONG');
	}

	// Trim any whitespace from the subject
	/* eslint-disable no-param-reassign */
	subject = subject.trim();
	/* eslint-enable no-param-reassign */

	// Punctuation checks
	if (/[:.?!,]/.test(subject.slice(-1))) {
		problems[commit].errors.push('SUBJECT_TRAILING_PUNCTUATION');
	}

	// Grammar checks
	const [subjectLeadWord] = subject.split(' ');

	if (!/^["']?[A-Z][a-z\-"']+/.test(subjectLeadWord)) {
		problems[commit].errors.push('SUBJECT_INVALID');
	}

	// Note: These are obviously very rudimentary heuristic checks for grammar,
	//       which is why they only generate warnings. It doesn't check for verbs,
	//       but hooking into a grammar API seemed a little overkill.
	if (
		/(ed|ing)$/.test(subjectLeadWord.toLowerCase()) &&
		!SUBJECT_VERB_EXCEPTIONS.includes(subjectLeadWord.toLowerCase())
	) {
		problems[commit].errors.push('SUBJECT_GRAMMAR');
	}
}

function checkBody(commit, body) {
	// Length checks
	body.forEach((line) => {
		if (line.length > 72) {
			problems[commit].errors.push('BODY_TOO_LONG');
		}
	});
}

function getIndexOfMetadata(metadata) {
	let metadataIndex = -1;
	/* eslint-disable prefer-template */
	const metadataLinePattern = new RegExp(
		'^(?:' +
			'(?:[Cc]los(?:e[sd]?|ing)' +
			'|[Ff]ix(?:e[sd]|ing)?' +
			'|[Rr]esolv(?:e[sd]?|ing)' +
			'|[Ii]mplement(?:s|ed|ing)?' +
			'|[Rr]elated' +
			'|[Ss]ee also):? ' +
			ISSUE_TRACKER_TICKET_PATTERN_STRING +
			'|[a-zA-Z]+(?: [a-z]+)?: )'
	);
	/* eslint-enable prefer-template */

	// Inclusion check
	for (let index = 0; index < metadata.length; index++) {
		if (metadataLinePattern.test(metadata[index])) {
			metadataIndex = index;
			break;
		}
	}

	return metadataIndex;
}

function checkMetadata(commit, metadata) {
	const formatPattern = /^([A-Z][a-z]+(?: [a-z]+)?): /;
	const issueTrackerTicketPattern = new RegExp(
		`^${ISSUE_TRACKER_TICKET_PATTERN_STRING}$`
	);

	// Validity check
	const isMetadataValid = metadata.every((datum) => {
		const match = datum.match(formatPattern);
		return match !== null && VALID_METADATA_TAGS.includes(match[1]);
	});
	if (!isMetadataValid) {
		problems[commit].errors.push('METADATA_INVALID');
	}

	// Issue tracker ticket format check
	metadata.forEach((datum) => {
		const match = datum.match(formatPattern);
		if (
			match !== null &&
			VALID_ISSUE_TRACKER_TICKET_TAGS.includes(match[1])
		) {
			const metaTickets = datum
				.replace(formatPattern, '')
				.split(',')
				.map(Function.prototype.call, String.prototype.trim);

			const isProperlyFormatted = metaTickets.every((ticket) => {
				return issueTrackerTicketPattern.test(ticket);
			});
			if (!isProperlyFormatted) {
				problems[commit].errors.push('METADATA_TICKET_FORMAT');
			}
		}
	});
}

function formatWarning(key) {
	return chalk.yellow(`⚠ ${MESSAGE[key]}`);
}

function formatError(key) {
	return chalk.red(`✗ ${MESSAGE[key]}`);
}

rl.on('line', (line) => {
	refLines.push(line);
});

rl.on('close', () => {
	try {
		refLines.forEach((refLine) => {
			const refFields = refLine.trim().split(' ');
			const tipOfLocalBranch = refFields[1];
			const tipOfRemoteBranch = refFields[3];

			if (!tipOfLocalBranch) {
				throw new CustomError(
					'The tip-of-tree was not specified. Please run this hook via Git.'
				);
			}

			// If the branch/commit is being deleted, skip the checks
			if (tipOfLocalBranch === EMPTY_COMMIT_HASH) {
				return;
			}

			const commitsToPushCmdArgs = ['rev-list', tipOfLocalBranch];
			if (tipOfRemoteBranch && tipOfRemoteBranch !== EMPTY_COMMIT_HASH) {
				commitsToPushCmdArgs.push(`^${tipOfRemoteBranch}`);
			} else {
				// Note: If a new branch is being created, filter out all of the
				//       commits that exist in pre-existing remote branches. This is
				//       to account for the case where new branches are just deviations
				//       from other branches; this makes sure that only universally
				//       new (to the remote) commits will be checked.
				commitsToPushCmdArgs.push('--not', '--remotes');
			}

			const commitsToPush = execFileSync('git', commitsToPushCmdArgs, {
				encoding: 'utf8',
			})
				.trim()
				.split('\n')
				.filter((commit) => {
					// Only check commits that don't exist in the remote yet and are
					// not being deleted
					return (
						typeof commit === 'string' &&
						commit !== EMPTY_COMMIT_HASH
					);
				});

			// Only run this hook if there are commits to pushed
			if (!commitsToPush.length || !commitsToPush[0]) {
				return;
			}

			commitsToPush.forEach((commit) => {
				const commitMessage = execFileSync(
					'git',
					['log', '-n', '1', commit, '--pretty=format:%B'],
					{ encoding: 'utf8' }
				);
				const commitMessageLines = commitMessage.split('\n');

				problems[commit] = {
					warnings: [],
					errors: [],
				};

				// If this is a merge or revert commit, skip the checks
				if (
					execFileSync(
						'git',
						['log', '-n', '1', commit, '--pretty=format:%P'],
						{
							encoding: 'utf8',
						}
					)
						.trim()
						.split(' ').length > 1 ||
					/^Revert/.test(commitMessageLines[0])
				) {
					return;
				}

				// Trim trailing empty lines
				while (
					commitMessageLines[commitMessageLines.length - 1] === ''
				) {
					commitMessageLines.pop();
				}

				checkSubject(commit, commitMessageLines[0]);

				// Determine the beginning of the body block
				const bodySepIdx = commitMessageLines.indexOf('');

				// Determine the ending of the body block / beginning of the metadata block
				// Note: The separator is on the line before the first metadata line, so
				//       feeding the function all but the subject line ends up finding the
				//       metadata separator line's index.
				const metadataSepIdx = getIndexOfMetadata(
					commitMessageLines.slice(1)
				);

				// Check if the body was not separated properly
				if (bodySepIdx === -1 && commitMessageLines.length > 1) {
					problems[commit].errors.push('BODY_SUBJECT_SEPARATION');

					// Check if the metadata block was not separated properly
				} else if (
					metadataSepIdx !== -1 &&
					commitMessageLines[metadataSepIdx] !== ''
				) {
					problems[commit].errors.push('BODY_METADATA_SEPARATION');

					// Check if the body was omitted
				} else if (
					(metadataSepIdx !== -1 && metadataSepIdx === bodySepIdx) ||
					(bodySepIdx === -1 && commitMessageLines.length === 1)
				) {
					problems[commit].warnings.push('BODY_OMITTED');
				} else {
					checkBody(
						commit,
						commitMessageLines.slice(
							bodySepIdx + 1,
							metadataSepIdx === bodySepIdx
								? commitMessageLines.length
								: metadataSepIdx
						)
					);
				}

				if (metadataSepIdx === -1) {
					problems[commit].warnings.push('METADATA_OMITTED');
				} else {
					checkMetadata(
						commit,
						commitMessageLines.slice(metadataSepIdx + 1)
					);
				}

				// Print any warnings and errors
				if (
					problems[commit].warnings.length ||
					problems[commit].errors.length
				) {
					console.error();
					console.error(
						`Commit ${chalk.bold(commit)} with the commit message`,
						'\n'
					);
					console.error(commitMessage);
					console.error('has the following issues:');
					if (problems[commit].warnings.length) {
						warningsDetected = true;
						console.error(
							Array.from(new Set(problems[commit].warnings))
								.map(formatWarning)
								.join('\n')
						);
					}
					if (problems[commit].errors.length) {
						errorsDetected = true;
						console.error(
							Array.from(new Set(problems[commit].errors))
								.map(formatError)
								.join('\n')
						);
					}
					console.error();
				}
			});
		});
	} catch (e) {
		errorsDetected = true;
		if (e instanceof CustomError) {
			console.error(e.message);
		}
	}

	// If errors were detected, bail out
	if (errorsDetected) {
		console.error('Fix the errors and try again.');
		console.error(chalk.red('Aborting push...'));
		process.exit(1);

		// If warnings were detected, prompt if they want to continue
	} else if (warningsDetected) {
		ttyPrompt.question(
			'Are you sure you want to continue? (y/N) ',
			(answer) => {
				ttyPrompt.close();

				if (/^y/i.test(answer)) {
					console.log(
						chalk.yellow('Allowing push despite warnings...')
					);
					process.exit(0);
				} else {
					console.error(chalk.red('Aborting push...'));
					process.exit(1);
				}
			}
		);
	} else {
		// Exit with success
		process.exit(0);
	}
});
