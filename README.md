# I test what happens behind a "success" response

QA engineer with 2.5 years in industry, open to remote roles and contract work.

This repository is the backend testing part of my QA portfolio. Most API tests send a request, see a 200 and move on. That catches an endpoint that is down. It rarely catches the bug that surfaces weeks later, like a webhook that never arrived, a number saved slightly wrong, or a background job that ran twice. I check what happens after the response. Whether the data stored matches what was sent. Whether each webhook reached the right place, once. Whether background work finished, and whether the API still matches its own published contract.

To prove the method carries over, I pointed it at four open-source products that work like four different businesses. Medusa is an online store, Cal.com is a booking tool, Documenso handles e-signatures and Twenty is a CRM. Across the four I recorded 14 findings, 12 of them proven. If your product sends webhooks, runs background jobs or publishes an API, I can test it the same way.

## What that looks like in practice

- **A failed webhook recorded as delivered.** On Cal.com, the receiving server answered with an error, yet the delivery was marked successful after one attempt and never retried. ([write-up](https://github.com/Jayami123/api-webhook-db-test-suite/blob/99a2fdebbb60aac196fcb0fce16911e36a0d5c0a/docs/upstream/b2.md))
- **Every task delivered twice.** On Cal.com, two background workers running at the same time each sent the same queued tasks.
- **A number changed without an error.** On Twenty, an amount of 9007199254740993 was accepted and stored as 9007199254740992, through both the REST and GraphQL APIs. ([write-up](https://github.com/Jayami123/api-webhook-db-test-suite/blob/99a2fdebbb60aac196fcb0fce16911e36a0d5c0a/docs/upstream/p2-tw-bug-001.md))
- **A deleted webhook still got the events.** On Twenty, for about 10 seconds after a webhook was replaced, events went to the deleted one and the new one missed them. ([write-up](https://github.com/Jayami123/api-webhook-db-test-suite/blob/99a2fdebbb60aac196fcb0fce16911e36a0d5c0a/docs/upstream/p2-tw-bug-003.md))
- **A delete that answered "server error" and left the document live.** On Documenso, deleting a document at the moment it completed failed with a 500 and the document stayed.
- **APIs that don't match their own documentation.** On Cal.com, Twenty and Medusa, live responses broke the published OpenAPI contract, with fields missing or null where the spec said they couldn't be.

## Why the numbers hold up

Every check runs on GitHub's servers against fresh copies of the products, never on my laptop. Results are read back from the database and from captured webhook deliveries, not taken from the API's own reply. For 10 of the 12 proven findings, a test is written to expect the failure, so if the product changes, the build turns red and the record can't go stale.

## Next step

- **To see how it works,** read the [technical guide](docs/technical-guide.md), with every lane, finding and the evidence behind it.
- **To talk about a role,** I'm open to remote QA roles.
- **To get your product tested,** I take contract work for startups before a launch or an integration goes live.

**[LinkedIn](https://www.linkedin.com/in/jayamihettigoda/)** · **[Email](mailto:jayami2114@gmail.com)** · [GitHub](https://github.com/Jayami123)

<sub>Built with TypeScript, Node.js's built-in test runner and Playwright, Docker and GitHub Actions.</sub>
