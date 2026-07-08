"""Cloudflare Tunnel integration service.

Extracted from app.py. Manages DNS CNAME records and tunnel ingress rules
for automatic subdomain provisioning during tenant registration and cleanup.
"""
import urllib.request
import ssl
import json

from models import SystemConfig
from extensions import logger


def get_cloudflare_config():
    """Get Cloudflare Tunnel configuration from SystemConfig."""
    cfg = {c.key: c.value for c in SystemConfig.query.all()}
    return {
        'api_token': cfg.get('cf_api_token', ''),
        'account_id': cfg.get('cf_account_id', ''),
        'tunnel_id': cfg.get('cf_tunnel_id', ''),
        'tunnel_name': cfg.get('cf_tunnel_name', ''),
        'zone_name': cfg.get('cf_zone_name', 'salfa.my.id'),
    }


def _make_ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def add_tunnel_hostname(full_subdomain, base_domain, tunnel_id=None):
    """Add a public hostname to a Cloudflare Tunnel via API.
    Creates a DNS CNAME record pointing to the tunnel and adds ingress rule.
    Returns (success, message)."""
    cf = get_cloudflare_config()
    api_token = cf['api_token']
    account_id = cf['account_id']
    tid = tunnel_id or cf['tunnel_id']
    zone_name = cf['zone_name'] or base_domain

    if not api_token or not account_id or not tid:
        logger.warning("[CF] Cloudflare not configured — skipping tunnel hostname setup")
        return False, 'Cloudflare not configured'

    hostname = f"{full_subdomain}.{zone_name}"
    dns_target = f"{tid}.cfargotunnel.com"
    headers = {
        'Authorization': f'Bearer {api_token}',
        'Content-Type': 'application/json',
    }
    ctx = _make_ctx()

    # Step 1: Get zone ID for the domain
    try:
        zone_url = f"https://api.cloudflare.com/client/v4/zones?name={zone_name}"
        req = urllib.request.Request(zone_url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        zone_data = json.loads(resp.read().decode('utf-8'))
        if not zone_data.get('success') or not zone_data.get('result'):
            logger.error(f"[CF] Zone not found: {zone_name}")
            return False, f'Zone {zone_name} not found'
        zone_id = zone_data['result'][0]['id']
    except Exception as e:
        logger.error(f"[CF] Failed to get zone: {e}")
        return False, f'Failed to get zone: {e}'

    # Step 2: Create or update DNS CNAME record
    try:
        dns_list_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records?name={hostname}"
        req = urllib.request.Request(dns_list_url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        dns_data = json.loads(resp.read().decode('utf-8'))
        existing = dns_data.get('result', [])

        if existing:
            record_id = existing[0]['id']
            dns_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records/{record_id}"
            payload = json.dumps({
                'type': 'CNAME',
                'name': hostname,
                'content': dns_target,
                'proxied': True,
            }).encode('utf-8')
            req = urllib.request.Request(dns_url, data=payload, headers=headers, method='PUT')
        else:
            dns_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records"
            payload = json.dumps({
                'type': 'CNAME',
                'name': hostname,
                'content': dns_target,
                'proxied': True,
            }).encode('utf-8')
            req = urllib.request.Request(dns_url, data=payload, headers=headers, method='POST')

        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        result = json.loads(resp.read().decode('utf-8'))
        if not result.get('success'):
            logger.error(f"[CF] DNS record failed: {result.get('errors')}")
            return False, f'DNS record failed: {result.get("errors")}'
        logger.info(f"[CF] DNS CNAME {hostname} -> {dns_target} created/updated")
    except Exception as e:
        logger.error(f"[CF] DNS record error: {e}")
        return False, f'DNS record error: {e}'

    # Step 3: Add ingress rule to tunnel config
    try:
        tunnel_cfg_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/cfd_tunnel/{tid}/configurations"
        req = urllib.request.Request(tunnel_cfg_url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        cfg_data = json.loads(resp.read().decode('utf-8'))

        if cfg_data.get('success'):
            existing_config = cfg_data.get('result', {}).get('config', {})
            ingress_rules = existing_config.get('ingress', [])
            already_exists = any(r.get('hostname') == hostname for r in ingress_rules)
            if not already_exists:
                new_rule = {'hostname': hostname, 'service': 'http://localhost:8080'}
                if ingress_rules and ingress_rules[-1].get('hostname') is None:
                    ingress_rules.insert(-1, new_rule)
                else:
                    ingress_rules.append(new_rule)
                existing_config['ingress'] = ingress_rules

                put_payload = json.dumps({'config': existing_config}).encode('utf-8')
                req = urllib.request.Request(tunnel_cfg_url, data=put_payload, headers=headers, method='PUT')
                resp = urllib.request.urlopen(req, timeout=15, context=ctx)
                put_result = json.loads(resp.read().decode('utf-8'))
                if put_result.get('success'):
                    logger.info(f"[CF] Tunnel ingress rule added for {hostname}")
                else:
                    logger.error(f"[CF] Tunnel ingress update failed: {put_result.get('errors')}")
            else:
                logger.info(f"[CF] Tunnel ingress rule already exists for {hostname}")
        else:
            logger.warning(f"[CF] Could not fetch tunnel config: {cfg_data.get('errors')}")
    except Exception as e:
        logger.error(f"[CF] Tunnel ingress error: {e}")

    return True, f'{hostname} configured successfully'


def remove_tunnel_hostname(full_subdomain, base_domain='salfa.my.id'):
    """Remove a public hostname from Cloudflare Tunnel via API.
    Deletes the DNS CNAME record and removes the ingress rule.
    Returns (success, message)."""
    cf = get_cloudflare_config()
    api_token = cf['api_token']
    account_id = cf['account_id']
    tid = cf['tunnel_id']
    zone_name = cf['zone_name'] or base_domain

    if not api_token or not account_id or not tid:
        logger.warning("[CF] Cloudflare not configured — skipping tunnel hostname removal")
        return False, 'Cloudflare not configured'

    hostname = f"{full_subdomain}.{zone_name}"
    headers = {
        'Authorization': f'Bearer {api_token}',
        'Content-Type': 'application/json',
    }
    ctx = _make_ctx()

    # Step 1: Get zone ID
    try:
        zone_url = f"https://api.cloudflare.com/client/v4/zones?name={zone_name}"
        req = urllib.request.Request(zone_url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        zone_data = json.loads(resp.read().decode('utf-8'))
        if not zone_data.get('success') or not zone_data.get('result'):
            logger.error(f"[CF] Zone not found: {zone_name}")
            return False, f'Zone {zone_name} not found'
        zone_id = zone_data['result'][0]['id']
    except Exception as e:
        logger.error(f"[CF] Failed to get zone: {e}")
        return False, f'Failed to get zone: {e}'

    # Step 2: Find and delete DNS CNAME record
    try:
        dns_list_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records?name={hostname}"
        req = urllib.request.Request(dns_list_url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        dns_data = json.loads(resp.read().decode('utf-8'))
        existing = dns_data.get('result', [])

        if existing:
            for record in existing:
                record_id = record['id']
                dns_del_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records/{record_id}"
                req = urllib.request.Request(dns_del_url, headers=headers, method='DELETE')
                resp = urllib.request.urlopen(req, timeout=15, context=ctx)
                del_result = json.loads(resp.read().decode('utf-8'))
                if del_result.get('success'):
                    logger.info(f"[CF] DNS record deleted for {hostname}")
                else:
                    logger.error(f"[CF] DNS delete failed: {del_result.get('errors')}")
        else:
            logger.info(f"[CF] No DNS record found for {hostname}")
    except Exception as e:
        logger.error(f"[CF] DNS delete error: {e}")

    # Step 3: Remove ingress rule from tunnel config
    try:
        tunnel_cfg_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/cfd_tunnel/{tid}/configurations"
        req = urllib.request.Request(tunnel_cfg_url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15, context=ctx)
        cfg_data = json.loads(resp.read().decode('utf-8'))

        if cfg_data.get('success'):
            existing_config = cfg_data.get('result', {}).get('config', {})
            ingress_rules = existing_config.get('ingress', [])
            new_rules = [r for r in ingress_rules if r.get('hostname') != hostname]
            if len(new_rules) < len(ingress_rules):
                existing_config['ingress'] = new_rules
                put_payload = json.dumps({'config': existing_config}).encode('utf-8')
                req = urllib.request.Request(tunnel_cfg_url, data=put_payload, headers=headers, method='PUT')
                resp = urllib.request.urlopen(req, timeout=15, context=ctx)
                put_result = json.loads(resp.read().decode('utf-8'))
                if put_result.get('success'):
                    logger.info(f"[CF] Tunnel ingress rule removed for {hostname}")
                else:
                    logger.error(f"[CF] Tunnel ingress removal failed: {put_result.get('errors')}")
            else:
                logger.info(f"[CF] No ingress rule found for {hostname}")
        else:
            logger.warning(f"[CF] Could not fetch tunnel config: {cfg_data.get('errors')}")
    except Exception as e:
        logger.error(f"[CF] Tunnel ingress removal error: {e}")

    return True, f'{hostname} removed successfully'
