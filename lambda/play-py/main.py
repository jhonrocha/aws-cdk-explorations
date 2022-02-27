"""Json module"""
import json

def handler(event, _context):
    """
    Lambda Handler

    Parameters
    ----------
    event : dict
        An event

    Returns
    -------
    dict
        The response object
    """
    print(f"request: {json.dumps(event)}")
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({ "hello": f"Hello World from Python! Handler at {event['path']}"})
    }
