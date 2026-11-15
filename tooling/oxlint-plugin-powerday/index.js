import noComments from "./rules/no-comments.js"
import noRaw from "./rules/no-raw.js"

const plugin = {
  meta: { name: "powerday" },
  rules: {
    "no-comments": noComments,
    "no-raw": noRaw,
  },
}

export default plugin
