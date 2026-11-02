import { HTTPException } from 'hono/http-exception'

// Routes throw these; app.onError turns them into `{ error: message }` JSON.

/** 400: the request itself is malformed (bad JSON, missing header). */
export const badRequest = (message: string) => new HTTPException(400, { message })

/** 404: the thing in the URL does not exist. */
export const notFound = (what: string) => new HTTPException(404, { message: `${what} not found` })

/** 409: the request conflicts with the current state (e.g. share already paid). */
export const conflict = (message: string) => new HTTPException(409, { message })

/** 422: the JSON is valid but the values are not (empty name, bad amount, no members). */
export const unprocessable = (message: string) => new HTTPException(422, { message })
