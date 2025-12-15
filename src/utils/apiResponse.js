// src/utils/apiResponse.js


export function sendSuccess(res, data = null, message = "OK", statusCode = 200) {
    const payload = { success: true, message };
    if (data !== null) {
        payload.data = data;
    }
    return res.status(statusCode).json(payload);
}

export function sendError(res, message = "Something went wrong", statusCode = 500) {
    return res.status(statusCode).json({
        success: false,
        message,
    });
}
