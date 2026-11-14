"""Exercise the mobile browser discard witness, including rejection paths."""
import unittest

from browser_mobile_table_layout_witness import discard_witness_errors


def witness(destination):
    return {
        'before': {
            'phase': 'awaiting-discard', 'humanSeat': 1, 'turn': 1,
            'canConfirm': True, 'selectedTileOwned': True,
        },
        'events': [{'event': 'confirm-started'}, {'event': 'confirm-accepted'}],
        'transitions': [{'source': 'GameController.confirm'}],
        'stateChanged': True,
        'transitionedFromHumanDiscard': True,
        'selectedTileOwnedAfter': False,
        'destination': destination,
        'pageErrors': [],
    }


class MobileDiscardWitnessTest(unittest.TestCase):
    def test_normal_discard_to_river_is_accepted(self):
        self.assertEqual(discard_witness_errors(witness({'river': True, 'openMeld': False, 'winningTile': False})), [])

    def test_legal_cpu_call_to_public_meld_is_accepted(self):
        self.assertEqual(discard_witness_errors(witness({'river': False, 'openMeld': True, 'winningTile': False})), [])

    def test_rejected_action_fails(self):
        observed = witness({'river': False, 'openMeld': False, 'winningTile': False})
        observed['events'][-1]['event'] = 'confirm-rejected'
        observed['stateChanged'] = False
        observed['selectedTileOwnedAfter'] = True
        errors = discard_witness_errors(observed)
        self.assertTrue(any('did not accept' in error for error in errors))
        self.assertTrue(any('state did not change' in error for error in errors))
        self.assertTrue(any('remained in the human hand' in error for error in errors))
        self.assertTrue(any('absent from the river' in error for error in errors))

    def test_missing_controller_transition_fails(self):
        observed = witness({'river': True, 'openMeld': False, 'winningTile': False})
        observed['transitions'] = [{'source': 'AutomaticTurnRunner'}]
        observed['transitionedFromHumanDiscard'] = False
        errors = discard_witness_errors(observed)
        self.assertTrue(any('did not record its GameController.confirm' in error for error in errors))
        self.assertTrue(any('did not leave the human discard phase' in error for error in errors))

    def test_page_error_fails(self):
        observed = witness({'river': True, 'openMeld': False, 'winningTile': False})
        observed['pageErrors'] = [{'name': 'TypeError'}]
        self.assertTrue(any('page JavaScript error' in error for error in discard_witness_errors(observed)))


if __name__ == '__main__':
    unittest.main()
