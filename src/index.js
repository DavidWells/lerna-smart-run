#!/usr/bin/env node
const path = require('path')
const yargs = require("yargs/yargs");
const log = require("npmlog");
const filterOptions = require("@lerna/filter-options");
const globalOptions = require("@lerna/global-options");

const gitOperations = require("./utils/git-operations");
const lernaOperations = require("./utils/lerna-operations");
const childProcess = require("child_process");
const { fstat } = require('fs')

const getLernaChanged = () => {
  return childProcess
    .execSync("lerna changed -p")
    .toString("utf8")
    .trim()
};

const argv = globalOptions(
  filterOptions(
    yargs(process.argv)
      // this captures args after --
      .parserConfiguration({
        "populate--": true,
      })
      .scriptName("smartCommand")
      .option("tagOnSuccess", {
        alias: "t",
        type: "boolean",
        default: false,
        description: "Create and push a git tag when the script finishes",
      })
      .option("deleteTagOnSuccess", {
        alias: "d",
        type: "boolean",
        default: false,
        description: "Delete the previous git tag when the script finishes",
      })
      .option("runFirst", {
        alias: "f",
        type: "string",
        default: false,
        description: "Packages to run first",
      })
      .option("runLast", {
        alias: "l",
        type: "string",
        default: false,
        description: "Packages to run last",
      })
      .option("deleteTag", {
        alias: "D",
        type: "boolean",
        default: false,
        description: "Only delete the previous tag if it exists",
      })
  )
).argv;

const handler = async () => {
  try {
    const previousTag = gitOperations.getPreviousTag();
    console.log('Previous git tag', previousTag)

    const changed = getLernaChanged()
    console.log('Lerna files changed', changed)
    if (!changed) {
      console.log('nothing changed')
      return 
    }

    const packagePaths = changed.split('\n')
    const scopes = packagePaths.map((folder) => {
      return require(path.join(folder, 'package.json')).name
    })
    console.log('Lerna scopes', scopes)
    /*
    const scopesArgs = scopes.reduce((acc, pkg) => {
      return acc + ` --scope ${pkg}`
    }, '')
    */

    // console.log('scopesArgs', scopesArgs)


    if (argv.deleteTag) {
      log.notice("lerna-smart-run", `Deleting previous tag and exiting`);
      gitOperations.deletePreviousTag(previousTag);
      process.exit(0);
    }

    const script = argv["_"][2];
    console.log('Lerna RUN ', script)

    if (!script) {
      throw new Error("The first argument must specify an npm script to run!");
    }

    if (argv.tagOnSuccess && argv.deleteTagOnSuccess) {
      throw new Error(
        "Tag on success automatically deletes the previous tag. Cannot call both --tagOnSuccess and --deleteTagOnSuccess"
      );
    }

    const lernaArgs = {
      stream: true,
      script: script,
    };

    if (!previousTag) {
      log.notice(
        "lerna-smart-run",
        `No previous tag found. Executing full ${script}`
      );
      await lernaOperations.runCommand(argv, lernaArgs, null, scopes);
    } else {
      log.info(
        "lerna-smart-run",
        `Tag ${previousTag} found. Executing smart ${script}`
      );
      await lernaOperations.runCommand(argv, lernaArgs, previousTag, scopes);
    }

    if (argv.tagOnSuccess) {
      log.info("lerna-smart-run", "Pushing new tag");
      gitOperations.generateNewTag(previousTag);
    }

    if (argv.deleteTagOnSuccess && previousTag) {
      log.info("lerna-smart-run", "Deleting previous tag");
      gitOperations.deletePreviousTag(previousTag);
    }

    process.exit(0);
  } catch (error) {
    log.error("lerna-smart-run", error);
    process.exit(1);
  }
};

exports.handler = handler();
