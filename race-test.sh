#!/usr/bin/env bash
# Triggers the seat double-book race condition.
# Usage: ./race-test.sh <tenant_token> <room_id>

set -e

TOKEN="$1"
ROOM_ID="$2"

if [ -z "$TOKEN" ] || [ -z "$ROOM_ID" ]; then
  echo "Usage: $0 <tenant_token> <room_id>"
  exit 1
fi

API="http://localhost:3001"

# Two parallel POSTs for the same seat. With Read Committed isolation, both will
# succeed (bug). With Serializable, one will fail with conflict (correct).
for i in 1 2; do
  (
    curl -s -X POST "$API/api/bookings" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -w "  → request $i: HTTP %{http_code}\n" \
      -d "{
        \"roomId\": \"$ROOM_ID\",
        \"seatNumber\": 2,
        \"startMonth\": \"2026-07\",
        \"durationMonths\": 3
      }" -o /tmp/race-response-$i.json
  ) &
done
wait

echo
echo "Response 1:"
cat /tmp/race-response-1.json
echo
echo "Response 2:"
cat /tmp/race-response-2.json
echo