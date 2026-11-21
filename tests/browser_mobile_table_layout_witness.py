"""Safe acceptance checks for a browser-observed local discard."""


def discard_witness_errors(witness):
    before = witness['before']
    events = witness['events']
    transitions = witness['transitions']
    errors = []
    if before['phase'] != 'awaiting-discard' or before['turn'] != before['humanSeat']:
        errors.append('discard did not start on the human discard turn')
    if not before['canConfirm'] or not before['selectedTileOwned']:
        errors.append('the selected physical tile was not confirmable and owned before the click')
    if sum(event['event'] == 'confirm-started' for event in events) != 1:
        errors.append('the discard click did not reach GameController.confirm exactly once')
    if not any(event['event'] == 'confirm-accepted' for event in events):
        errors.append('GameController.confirm did not accept the discard')
    if not any(event['source'] == 'GameController.confirm' for event in transitions):
        errors.append('the accepted discard did not record its GameController.confirm state transition')
    if not witness['stateChanged']:
        errors.append('the game state did not change after the accepted discard')
    if not witness['transitionedFromHumanDiscard']:
        errors.append('the accepted discard did not leave the human discard phase')
    if witness['selectedTileOwnedAfter']:
        errors.append('the selected physical tile remained in the human hand')
    destination = witness['destination']
    if not (destination['river'] or destination['openMeld'] or destination['winningTile']):
        errors.append('the selected physical tile was absent from the river, a public meld, and the winning tile')
    if witness['pageErrors']:
        errors.append('a page JavaScript error occurred during the discard action')
    return errors
