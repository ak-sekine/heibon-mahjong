"""Regression for a CPU ending the first round before the human can discard."""
from pathlib import Path
import runpy
import unittest

smoke_helpers = runpy.run_path(str(Path(__file__).with_name('browser-itch-package.py')))
wait_for_human_action = smoke_helpers['wait_for_human_action']
build_discard_witness = smoke_helpers['build_discard_witness']
validate_discard_witness = smoke_helpers['validate_discard_witness']


class StartupPage:
    def __init__(self, dialog_open):
        self.dialog_open = dialog_open
        self.advanced = False
        self.actions = []

    def locator(self, selector):
        page = self

        class Control:
            def count(self):
                return int(page.advanced)

            def is_visible(self):
                return selector == '#next-round'

            def is_enabled(self):
                return selector == '#next-round'

            def evaluate(self, expression):
                return page.dialog_open

            def click(self):
                page.actions.append(selector)
                if selector == '#view-table':
                    page.dialog_open = False
                elif selector == '#next-round':
                    page.advanced = True
                else:
                    raise AssertionError(selector)

        return Control()

    def wait_for_timeout(self, milliseconds):
        raise AssertionError('stalled at a completed round')


class ItchStartupTests(unittest.TestCase):
    def test_first_turn_abort_advances_with_result_closed_or_open(self):
        for opened in (False, True):
            with self.subTest(result_dialog_open=opened):
                page = StartupPage(opened)
                decisions = wait_for_human_action(page)
                self.assertEqual(decisions['rounds_advanced'], 1)
                self.assertEqual(page.actions, (['#view-table'] if opened else []) + ['#next-round'])

    def test_discard_witness_accepts_matching_awaiting_draw_phases(self):
        witness = self.make_witness(action_phase='awaiting-draw', transition_phase='awaiting-draw')
        validate_discard_witness(witness)

    def test_discard_witness_allows_cpu_progress_to_change_accepted_phase(self):
        rows = [self.start(), self.transition(next_phase='awaiting-draw'), self.cpu_transition(),
                self.action(next_phase='awaiting-discard')]
        witness = build_discard_witness(rows, [], self.tile())
        validate_discard_witness(witness)

    def test_discard_witness_ignores_later_cpu_events_and_accepts_called_meld_move(self):
        rows = self.discard_rows(action_phase='awaiting-discard', transition_phase='awaiting-draw')
        rows.extend([
            {'event': 'local_game_state_transition', 'source': 'AutomaticTurnRunner',
             'previousPhase': 'awaiting-draw', 'nextPhase': 'awaiting-discard'},
            {'event': 'local_action_state_update_started', 'operationId': 43, 'actionType': 'pass-call'},
        ])
        witness = build_discard_witness(rows, [], self.tile(river=0, called_meld=1))
        validate_discard_witness(witness)
        self.assertNotIn('operationId', repr(witness))

    def test_discard_witness_accepts_river_move(self):
        validate_discard_witness(self.make_witness())

    def test_discard_witness_rejects_missing_or_stale_operation_start(self):
        rows = self.discard_rows()
        for prior_ids, start_rows in (([], rows[1:]), ([42], rows)):
            with self.subTest(prior_ids=prior_ids):
                witness = build_discard_witness(start_rows, prior_ids, self.tile())
                with self.assertRaises(AssertionError):
                    validate_discard_witness(witness)

    def test_discard_witness_rejects_missing_same_operation_acceptance(self):
        rows = [self.start(), self.transition(), self.action(operation_id=41), self.cpu_transition()]
        witness = build_discard_witness(rows, [], self.tile())
        with self.assertRaises(AssertionError):
            validate_discard_witness(witness)

    def test_discard_witness_rejects_missing_confirm_transition(self):
        rows = [self.start(), self.action(), self.cpu_transition()]
        witness = build_discard_witness(rows, [], self.tile())
        with self.assertRaises(AssertionError):
            validate_discard_witness(witness)

    def test_discard_witness_rejects_confirm_transition_outside_operation_interval(self):
        rows = [self.transition(), self.start(), self.action(), self.transition()]
        witness = build_discard_witness(rows, [], self.tile())
        with self.assertRaises(AssertionError):
            validate_discard_witness(witness)

    def test_discard_witness_rejects_invalid_transition_origin_and_phase_pair(self):
        for transition in (
            self.transition(previous_phase='awaiting-ron'),
            self.transition(next_phase='awaiting-discard'),
            self.transition(next_phase='not-a-phase'),
            self.cpu_transition(),
        ):
            with self.subTest(transition=transition):
                rows = [self.start(), transition, self.action()]
                witness = build_discard_witness(rows, [], self.tile())
                with self.assertRaises(AssertionError):
                    validate_discard_witness(witness)

    def test_discard_witness_rejects_nonaccepted_result_and_bad_action_phases(self):
        for action in (
            self.action(result='rejected'),
            self.action(previous_phase='awaiting-draw'),
            self.action(next_phase='not-a-phase'),
            self.action(action_type='pass-call'),
        ):
            with self.subTest(action=action):
                witness = build_discard_witness([self.start(), self.transition(), action], [], self.tile())
                with self.assertRaises(AssertionError):
                    validate_discard_witness(witness)

    def test_discard_witness_rejects_tile_left_in_hand_or_duplicated(self):
        for tile in (
            self.tile(in_hand=True, river=0, called_meld=0),
            self.tile(river=1, called_meld=1),
            self.tile(river=2, called_meld=0),
            self.tile(river=0, called_meld=0),
        ):
            with self.subTest(tile=tile):
                witness = self.make_witness(tile=tile)
                with self.assertRaises(AssertionError):
                    validate_discard_witness(witness)

    @staticmethod
    def tile(in_hand=False, river=1, called_meld=0):
        return {'inHand': in_hand, 'riverOccurrences': river, 'calledMeldOccurrences': called_meld}

    @staticmethod
    def start(operation_id=42):
        return {'event': 'local_action_state_update_started', 'operationId': operation_id, 'actionType': 'discard'}

    @staticmethod
    def action(operation_id=42, action_type='discard', result='accepted',
               previous_phase='awaiting-discard', next_phase='awaiting-draw'):
        return {'event': 'local_action_state_update_succeeded', 'operationId': operation_id,
                'actionType': action_type, 'stateUpdateResult': result,
                'previousPhase': previous_phase, 'nextPhase': next_phase}

    @staticmethod
    def transition(source='GameController.confirm', previous_phase='awaiting-discard', next_phase='awaiting-draw'):
        return {'event': 'local_game_state_transition', 'source': source,
                'previousPhase': previous_phase, 'nextPhase': next_phase}

    @classmethod
    def cpu_transition(cls):
        return cls.transition(source='AutomaticTurnRunner')

    @classmethod
    def discard_rows(cls, action_phase='awaiting-draw', transition_phase='awaiting-draw'):
        return [cls.start(), cls.transition(next_phase=transition_phase), cls.action(next_phase=action_phase)]

    @classmethod
    def make_witness(cls, action_phase='awaiting-draw', transition_phase='awaiting-draw', tile=None):
        return build_discard_witness(
            cls.discard_rows(action_phase, transition_phase), [], tile or cls.tile())


if __name__ == '__main__':
    unittest.main()
