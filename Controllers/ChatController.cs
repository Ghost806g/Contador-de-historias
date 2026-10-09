using Microsoft.AspNetCore.Mvc;
using Contador_de_Historias.Models;
using Contador_de_Historias.Repositories;
using Contador_de_Historias.Services;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Contador_de_Historias.Controllers;

[ApiController]
[Route("api/chat")]
public class ChatController : ControllerBase
{
    private readonly IDatabaseRepository _repository;
    private readonly ILlmService _llmService;

    public ChatController(IDatabaseRepository repository, ILlmService llmService)
    {
        _repository = repository;
        _llmService = llmService;
    }

    public class MensagemRequest 
    {
        public int IdSessao { get; set; }
        public string Texto { get; set; } = string.Empty;
    }

    public class NovaSessaoRequest 
    {
        public string NomePersonagem { get; set; } = string.Empty;
        public string CenarioContexto { get; set; } = string.Empty;
    }

    [HttpPost("sessao/nova")]
    public async Task<IActionResult> CriarSessao([FromBody] NovaSessaoRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.NomePersonagem) || string.IsNullOrWhiteSpace(request.CenarioContexto))
            return BadRequest("Nome e cenário são obrigatórios.");

        var novaSessao = await _repository.CriarSessaoAsync(request.NomePersonagem, request.CenarioContexto);
        return Ok(novaSessao);
    }

    [HttpGet("sessoes")]
    public async Task<IActionResult> GetSessoes()
    {
        var sessoes = await _repository.GetSessoesAsync();
        return Ok(sessoes);
    }

    [HttpGet("historico/{idSessao}")]
    public async Task<IActionResult> GetHistorico(int idSessao)
    {
        var historico = await _repository.GetHistoricoSessaoAsync(idSessao);
        return Ok(historico);
    }

    [HttpDelete("rebobinar/{idSessao}/{idMensagem}")]
    public async Task<IActionResult> RebobinarHistorico(int idSessao, int idMensagem)
    {
        int linhasAfetadas = await _repository.DeletarMensagensAposAsync(idSessao, idMensagem);
        return Ok(new { message = $"Foram apagadas {linhasAfetadas} mensagens do histórico.", rebobinado = true });
    }

    [HttpDelete("sessao/{idSessao}")]
    public async Task<IActionResult> DeletarSessao(int idSessao)
    {
        await _repository.DeletarSessaoAsync(idSessao);
        return Ok();
    }

    [HttpPost("iniciar/{idSessao}")]
    public async Task<IActionResult> IniciarSessao(int idSessao)
    {
        string contextoRPG = await _repository.GetContextoSessaoAsync(idSessao);
        if (string.IsNullOrEmpty(contextoRPG)) return BadRequest("Sessão não encontrada.");

        // Cria a instrução silenciosa APENAS para a API da IA, sem salvar no banco do usuário
        var historicoFakeParaIA = new List<MensagemChat> {
            new MensagemChat { Papel = "Usuario", Conteudo = "(MENSAGEM INVISÍVEL DE SISTEMA: O jogador acabou de entrar. INICIE A HISTÓRIA IMEDIATAMENTE. Descreva a cena de forma brutal e visceral baseada no contexto. Coloque-o no meio de um dilema ou situação e termine esperando a reação dele. Não diga 'Bem vindo', apenas inicie a narração do mundo.)" }
        };

        Response.ContentType = "text/plain; charset=utf-8";

        try 
        {
            string respostaCompleta = await _llmService.StreamChatResponseAsync(contextoRPG, historicoFakeParaIA, Response.Body);
            
            // Salva a PRIMEIRA MENSAGEM DO NARRADOR no banco, para que na próxima vez ela seja carregada!
            await _repository.SalvarMensagemAsync(idSessao, "IA", respostaCompleta);
            return new EmptyResult();
        }
        catch (System.Exception ex)
        {
            System.Console.WriteLine($"Erro crítico: {ex.Message}");
            return StatusCode(500, "Conexão perdida ou Erro na API do Llama.");
        }
    }

    [HttpPost("enviar")]
    public async Task<IActionResult> EnviarMensagem([FromBody] MensagemRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Texto))
            return BadRequest("A mensagem não pode estar vazia.");

        string contextoRPG = await _repository.GetContextoSessaoAsync(request.IdSessao);
        if (string.IsNullOrEmpty(contextoRPG))
            return BadRequest("Sessão não encontrada.");

        // 1. Salvar a ação ATUAL do Usuário no banco
        await _repository.SalvarMensagemAsync(request.IdSessao, "Usuario", request.Texto);

        // 2. Resgatar o histórico da sessão
        var historico = await _repository.GetHistoricoSessaoAsync(request.IdSessao);
        
        // Mantém as últimas 100 mensagens
        var historicoRecente = historico.TakeLast(100);

        // Limpa possíveis repetições da mesma role para evitar travamentos
        var historicoLimpo = new List<MensagemChat>();
        string ultimoPapel = "";
        foreach (var msg in historicoRecente)
        {
            if (msg.Papel == ultimoPapel) continue;
            ultimoPapel = msg.Papel;
            historicoLimpo.Add(msg);
        }

        Response.ContentType = "text/plain; charset=utf-8";

        try 
        {
            // 3. Disparar a requisição e streamar
            string respostaCompleta = await _llmService.StreamChatResponseAsync(contextoRPG, historicoLimpo, Response.Body);

            // 4. Salvar a resposta completa da IA no banco de dados depois que terminou o fluxo
            await _repository.SalvarMensagemAsync(request.IdSessao, "IA", respostaCompleta);

            return new EmptyResult();
        }
        catch (System.Exception ex)
        {
            System.Console.WriteLine($"Erro crítico: {ex.Message}");
            return StatusCode(500, "Conexão perdida ou Erro na API.");
        }
    }
}