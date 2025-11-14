---
"@webiny/di": minor
---

Added new methods on Abstraction class: createImplementation, createDecorator, and createComposite.
Make token unique: use Symbol(name) to make each abstraction unique, even if using the same name.
