import assert from "assert"
import { describe, it } from "mocha"
import * as path from "path"
import { fileURLToPath } from "url"

import { connection } from "../../connect.js"
import { invoke } from "../../entrypoint/invoke.js"
import { load } from "../../entrypoint/load.js"
import { scan } from "../scanner/scan.js"
import { listFiles } from "../utils/files.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDirectory = `${__dirname}/testdata`

/**
 * These tests are a mimic of what dagger entrypoint should do
 * without the call to the Dagger API (data are mocked instead)
 *
 * The principle behind is exactly the same: we load the files and call a function from it.
 */
describe("Invoke typescript function", function () {
  it("Should correctly invoke hello world", async function () {
    const files = await listFiles(`${rootDirectory}/helloWorld`)

    // Load function
    await load(files)

    const scanResult = scan(files)

    // Mocking the fetch from the dagger API
    const input = {
      parentName: "HelloWorld",
      fnName: "helloWorld",
      parentArgs: {},
      fnArgs: { name: "world" },
    }

    const result = await invoke(scanResult, input)

    // We verify the result, this could be serialized and set using `dag.ReturnValue` as a response
    assert.equal(result, "hello world")
  })

  it("Should correctly execute dagger operation", async function () {
    this.timeout(60000)

    const files = await listFiles(`${rootDirectory}/multipleObjects`)

    // Load function
    await load(files)

    const scanResult = scan(files)

    // Mocking the fetch from the dagger API
    const input = {
      parentName: "Bar",
      fnName: "exec",
      parentArgs: {},
      fnArgs: {
        // string[]
        cmd: ["echo", "-n", "hello world"],
      },
    }

    // We wrap the execution into a Dagger connection
    await connection(async () => {
      const result = await invoke(scanResult, input)

      // We verify the result, this could be serialized and set using `dag.ReturnValue` as a response
      assert.equal(result, "hello world")
    })
  })

  it("Should correctly order arguments", async function () {
    this.timeout(60000)

    const files = await listFiles(`${rootDirectory}/multiArgs`)

    // Load function
    await load(files)

    const scanResult = scan(files)

    // Mocking the fetch from the dagger API
    const input = {
      parentName: "HelloWorld",
      fnName: "compute",
      parentArgs: {},
      fnArgs: {
        b: 2,
        a: 4,
        c: 3,
      },
    }

    // We wrap the execution into a Dagger connection
    await connection(async () => {
      const result = await invoke(scanResult, input)

      // We verify the result
      assert.equal(result, 11)
    })
  })

  it("Should correctly transfer state", async function () {
    this.timeout(60000)

    const files = await listFiles(`${rootDirectory}/state`)

    // Load function
    await load(files)

    const scanResult = scan(files)

    // We wrap the execution into a Dagger connection
    await connection(
      async () => {
        // Mocking the fetch from the dagger API
        const inputBase = {
          parentName: "Alpine",
          fnName: "base",
          parentArgs: {},
          fnArgs: { version: "3.16.0" },
        }

        const inputBaseResult = await invoke(scanResult, inputBase)

        // Assert state has been updated by the function
        assert.equal("3.16.0", inputBaseResult.version)
        assert.equal("root", inputBaseResult.user)
        assert.deepEqual([], inputBaseResult.packages)
        assert.notEqual(undefined, inputBaseResult.ctr)

        const inputInstall = {
          parentName: "Alpine",
          fnName: "install",
          // Would be fetched from dagger and parsed from dagger entrypoint
          parentArgs: JSON.parse(JSON.stringify(inputBaseResult)),
          fnArgs: {
            pkgs: ["jq"],
          },
        }

        const inputInstallResult = await invoke(scanResult, inputInstall)

        // Verify state conservation
        assert.equal("3.16.0", inputInstallResult.version)
        assert.equal("root", inputInstallResult.user)
        assert.deepEqual(["jq"], inputInstallResult.packages)
        assert.notEqual(undefined, inputInstallResult.ctr)

        const inputExec = {
          parentName: "Alpine",
          fnName: "exec",
          // Would be fetched from dagger and parsed from dagger entrypoint
          parentArgs: JSON.parse(JSON.stringify(inputInstallResult)),
          fnArgs: {
            cmd: ["jq", "-h"],
          },
        }

        const result = await invoke(scanResult, inputExec)

        // We verify the result, this could be serialized and set using `dag.ReturnValue` as a response
        // In that case, we verify it's not failing and that it returned a value
        assert.notEqual("", result)
      },
      { LogOutput: process.stderr }
    )
  })
})
